package mcpsandbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"
)

type DispatchFunc func(context.Context, string, []json.RawMessage) (json.RawMessage, error)
type StreamFunc func(context.Context, string, json.RawMessage, func(json.RawMessage) error) error

// CallError carries a safe, structured public Kernel error through the Go
// bridge. Internal Go errors are never forwarded to untrusted JavaScript.
type CallError struct {
	Code    string
	Message string
	Details json.RawMessage
}

func (e *CallError) Error() string { return e.Code + ": " + e.Message }

type ScriptError struct {
	Code    string
	Message string
	Details json.RawMessage
}

func (e *ScriptError) Error() string { return e.Code + ": " + e.Message }

// Limits are enforced per untrusted invocation, independently of the HTTP
// request budget. Zero-valued fields use the public defaults.
type Limits struct {
	Timeout        time.Duration
	MemoryMiB      uint32
	MaxCodeBytes   int
	MaxCalls       int
	MaxStreams     int
	MaxOutputBytes int
}

func (l Limits) effective() Limits {
	if l.Timeout == 0 {
		l.Timeout = 15 * time.Second
	}
	if l.MemoryMiB == 0 {
		l.MemoryMiB = 64
	}
	if l.MaxCodeBytes == 0 {
		l.MaxCodeBytes = 65536
	}
	if l.MaxCalls == 0 {
		l.MaxCalls = 2048
	}
	if l.MaxStreams == 0 {
		l.MaxStreams = 32
	}
	if l.MaxOutputBytes == 0 {
		l.MaxOutputBytes = 4 << 20
	}
	return l
}
func (l Limits) validate() error {
	if l.Timeout < time.Millisecond || l.Timeout > 2*time.Minute || l.MemoryMiB < 8 || l.MemoryMiB > 512 ||
		l.MaxCodeBytes < 1 || l.MaxCodeBytes > 1<<20 || l.MaxCalls < 1 || l.MaxCalls > 100000 ||
		l.MaxStreams < 1 || l.MaxStreams > 512 || l.MaxOutputBytes < 1024 || l.MaxOutputBytes > 16<<20 {
		return errors.New("invalid JavaScript sandbox budget")
	}
	return nil
}

type callRequest struct {
	ID     int    `json:"id"`
	Method string `json:"method"`
	Params string `json:"params"`
}
type callResponse struct {
	ID      int
	JSON    string
	Code    string
	Message string
	Details string
}

func (r *callResponse) setError(err error) {
	var public *CallError
	if errors.As(err, &public) {
		r.Code = public.Code
		r.Message = public.Message
		r.Details = string(public.Details)
	} else if errors.Is(err, errBadMethod) {
		r.Code = "PERMISSION_DENIED"
		r.Message = "SDK method is unavailable"
	} else {
		r.Code = "INTERNAL_ERROR"
		r.Message = "KG OS Kernel operation failed"
	}
}

type streamSession struct {
	events chan json.RawMessage
	done   chan error
	cancel context.CancelFunc
}
type invocation struct {
	streams    map[int]*streamSession
	streamLock sync.Mutex
	nextStream int
	calls      int
	response   chan callResponse
	ctx        context.Context
	dispatch   DispatchFunc
	stream     StreamFunc
	readOnly   bool
	limits     Limits
}

var errBadMethod = errors.New("SDK method is not allowed")
var readMethods = map[string]bool{
	"ontology.read": true, "object.read": true, "object.readText": true,
	"graph.query": true, "graph.streamQuery": true,
	"evolution.overview": true, "evolution.get": true, "evolution.ancestry": true, "evolution.history": true, "evolution.diff": true,
	"evolution.branch.list": true, "evolution.tag.list": true,
	"evolution.merge.list": true, "evolution.merge.get": true, "evolution.merge.conflicts": true,
}
var writeMethods = map[string]bool{
	"ontology.patch": true, "object.patch": true, "graph.execute": true, "graph.streamExecute": true,
	"evolution.state.create": true, "evolution.state.setData": true, "evolution.state.clearData": true,
	"evolution.branch.create": true, "evolution.branch.delete": true,
	"evolution.tag.create": true, "evolution.tag.move": true, "evolution.tag.delete": true,
	"evolution.merge.start": true, "evolution.merge.resolve": true, "evolution.merge.finalize": true, "evolution.merge.abort": true,
}

func (i *invocation) allowed(method string) bool {
	return readMethods[method] || (!i.readOnly && writeMethods[method])
}
func (i *invocation) send(response callResponse) {
	select {
	case i.response <- response:
	case <-i.ctx.Done():
	}
}
func (i *invocation) call(request callRequest) {
	res := callResponse{ID: request.ID}
	defer func() {
		if recover() != nil {
			i.send(callResponse{ID: request.ID, Code: "INTERNAL_ERROR", Message: "Internal SDK call failed"})
		} else {
			i.send(res)
		}
	}()
	if len(request.Params) > 1<<20 {
		res.Code = "RESOURCE_ERROR"
		res.Message = "SDK parameters exceed budget"
		return
	}
	var args []json.RawMessage
	if err := json.Unmarshal([]byte(request.Params), &args); err != nil {
		res.Code = "INVALID_ARGUMENT"
		res.Message = "Malformed SDK parameters"
		return
	}
	if request.Method == "stream-open" || request.Method == "stream-next" || request.Method == "stream-return" {
		raw, err := i.streamCall(request.Method, args)
		if err != nil {
			res.setError(err)
			return
		}
		res.JSON = string(raw)
		return
	}
	if !i.allowed(request.Method) {
		res.Code = "PERMISSION_DENIED"
		res.Message = errBadMethod.Error()
		return
	}
	raw, err := i.dispatch(i.ctx, request.Method, args)
	if err != nil {
		res.setError(err)
		return
	}
	if !json.Valid(raw) {
		res.Code = "INTERNAL_ERROR"
		res.Message = "Invalid JSON from Kernel"
		return
	}
	// The guest can discard the value after it receives it, so checking only
	// the final script result would leave individual Kernel responses unbounded.
	// Reject before allocating a corresponding QuickJS string.
	if i.limits.MaxOutputBytes > 0 && len(raw) > i.limits.MaxOutputBytes {
		res.Code = "RESOURCE_ERROR"
		res.Message = "SDK result exceeds budget"
		return
	}
	res.JSON = string(raw)
}
func (i *invocation) streamCall(method string, args []json.RawMessage) (json.RawMessage, error) {
	if method == "stream-open" {
		if len(args) != 2 {
			return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "stream-open needs method and request"}
		}
		var target string
		if err := json.Unmarshal(args[0], &target); err != nil || !(target == "graph.streamQuery" || (target == "graph.streamExecute" && !i.readOnly)) {
			return nil, errBadMethod
		}
		i.streamLock.Lock()
		if len(i.streams) >= i.limits.MaxStreams {
			i.streamLock.Unlock()
			return nil, &CallError{Code: "RESOURCE_ERROR", Message: "stream budget exceeded"}
		}
		i.nextStream++
		id := i.nextStream
		ctx, cancel := context.WithCancel(i.ctx)
		s := &streamSession{events: make(chan json.RawMessage), done: make(chan error, 1), cancel: cancel}
		i.streams[id] = s
		i.streamLock.Unlock()
		go func() {
			err := i.stream(ctx, target, args[1], func(v json.RawMessage) error {
				// Unbuffered send: the Kernel may only produce the next event when the guest pulls.
				if !json.Valid(v) {
					return errors.New("invalid Kernel stream event")
				}
				if i.limits.MaxOutputBytes > 0 && len(v) > i.limits.MaxOutputBytes {
					return &CallError{Code: "RESOURCE_ERROR", Message: "Graph stream event exceeds budget"}
				}
				select {
				case s.events <- v:
					return nil
				case <-ctx.Done():
					return ctx.Err()
				}
			})
			s.done <- err
			close(s.events)
		}()
		return json.Marshal(map[string]int{"streamId": id})
	}
	if len(args) != 1 {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "stream control needs id"}
	}
	var id int
	if err := json.Unmarshal(args[0], &id); err != nil {
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "invalid stream id"}
	}
	i.streamLock.Lock()
	s := i.streams[id]
	i.streamLock.Unlock()
	if s == nil {
		if method == "stream-return" {
			return json.RawMessage(`null`), nil
		}
		return nil, &CallError{Code: "INVALID_ARGUMENT", Message: "unknown or closed stream"}
	}
	if method == "stream-return" {
		i.streamLock.Lock()
		delete(i.streams, id)
		i.streamLock.Unlock()
		s.cancel()
		return json.RawMessage(`null`), nil
	}
	if method != "stream-next" {
		return nil, errBadMethod
	}
	select {
	case event, ok := <-s.events:
		if ok {
			result, _ := json.Marshal(struct {
				Done  bool            `json:"done"`
				Value json.RawMessage `json:"value"`
			}{Value: event})
			return result, nil
		}
		err := <-s.done
		i.streamLock.Lock()
		delete(i.streams, id)
		i.streamLock.Unlock()
		s.cancel()
		if err != nil {
			return nil, err
		}
		return json.RawMessage(`{"done":true}`), nil
	case <-i.ctx.Done():
		return nil, i.ctx.Err()
	}
}
func (i *invocation) close() {
	i.streamLock.Lock()
	defer i.streamLock.Unlock()
	for _, s := range i.streams {
		s.cancel()
	}
	clear(i.streams)
}

func Execute(ctx context.Context, code string, readOnly bool, dispatch DispatchFunc, stream StreamFunc) (json.RawMessage, error) {
	return ExecuteWithLimits(ctx, code, readOnly, dispatch, stream, Limits{})
}

func ExecuteWithLimits(ctx context.Context, code string, readOnly bool, dispatch DispatchFunc, stream StreamFunc, limits Limits) (result json.RawMessage, runErr error) {
	limits = limits.effective()
	if err := limits.validate(); err != nil {
		return nil, err
	}
	if len(code) > limits.MaxCodeBytes {
		return nil, errors.New("RESOURCE_ERROR: code budget exceeded")
	}
	if dispatch == nil || stream == nil {
		return nil, errors.New("missing Kernel adapter")
	}
	runCtx, cancel := context.WithTimeout(ctx, limits.Timeout)
	defer cancel()
	defer func() {
		if ctx.Err() != nil {
			runErr = &ScriptError{Code: "CANCELLED", Message: "Call cancelled; writes may have completed"}
			result = nil
		} else if runCtx.Err() != nil {
			runErr = &ScriptError{Code: "RESOURCE_ERROR", Message: "Sandbox deadline exceeded; writes may have completed"}
			result = nil
		}
	}()
	g, err := newGuest(runCtx, limits.MemoryMiB*16)
	if err != nil {
		return nil, err
	}
	defer g.Close(context.Background())
	g.driver, err = g.eval(runCtx, driverScript)
	if err != nil {
		return nil, err
	}
	if _, err = g.method(runCtx, "start", code); err != nil {
		return nil, err
	}
	i := &invocation{streams: make(map[int]*streamSession), response: make(chan callResponse, 64), ctx: runCtx, dispatch: dispatch, stream: stream, readOnly: readOnly, limits: limits}
	defer i.close()
	inFlight := 0
	for {
		if err = g.drainJobs(runCtx); err != nil {
			return nil, err
		}
		requests, err := g.method(runCtx, "drain")
		if err != nil {
			return nil, err
		}
		var batch []callRequest
		if err = json.Unmarshal([]byte(requests), &batch); err != nil {
			return nil, err
		}
		for _, req := range batch {
			if i.calls >= limits.MaxCalls {
				return nil, errors.New("RESOURCE_ERROR: bridge call budget exceeded")
			}
			i.calls++
			if inFlight >= 16 {
				return nil, errors.New("RESOURCE_ERROR: concurrent bridge call limit exceeded")
			}
			inFlight++
			go func(req callRequest) { i.call(req) }(req)
		}
		status, err := g.method(runCtx, "status")
		if err != nil {
			return nil, err
		}
		if len(status) > limits.MaxOutputBytes {
			return nil, errors.New("RESOURCE_ERROR: result exceeds budget")
		}
		var state struct {
			Done    bool            `json:"done"`
			Ok      bool            `json:"ok"`
			Result  json.RawMessage `json:"result"`
			Code    string          `json:"code"`
			Message string          `json:"message"`
			Details json.RawMessage `json:"details"`
		}
		if err := json.Unmarshal([]byte(status), &state); err != nil {
			return nil, err
		}
		if state.Done {
			if !state.Ok {
				code := state.Code
				if code == "" || len(code) > 64 {
					code = "SCRIPT_ERROR"
				}
				for _, char := range code {
					if !(char >= 'A' && char <= 'Z') && char != '_' {
						code = "SCRIPT_ERROR"
						break
					}
				}
				message := state.Message
				if len(message) > 1024 {
					message = message[:1024]
				}
				return nil, &ScriptError{Code: code, Message: message, Details: state.Details}
			}
			if state.Result == nil {
				return nil, errors.New("SCRIPT_RESULT_ERROR: undefined result")
			}
			return state.Result, nil
		}
		select {
		case res := <-i.response:
			inFlight--
			if res.Code == "" && res.JSON == "" {
				res.JSON = "null"
			}
			if _, err := g.method(runCtx, "deliver", strconv.Itoa(res.ID), res.JSON, res.Code, res.Message, res.Details); err != nil {
				return nil, err
			}
		case <-runCtx.Done():
			return nil, fmt.Errorf("RESOURCE_ERROR: invocation cancelled: %w", runCtx.Err())
		case <-time.After(5 * time.Millisecond):
		}
	}
}
