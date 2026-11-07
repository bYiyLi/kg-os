package observability

import (
	"context"
	"errors"
	"log/slog"
	"regexp"
	"time"

	"go.opentelemetry.io/otel/attribute"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

type operationKeyType struct{}

var safeTraceName = regexp.MustCompile(`^[a-z][a-z0-9_.]{0,63}$`)

// StartSpan always uses the per-Instance TracerProvider. No untrusted inbound
// traceparent or baggage is extracted into the authoritative execution tree.
func StartSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	observer := FromContext(ctx)
	if observer == nil || observer.tracer == nil {
		// Never hand back the incoming active span: callers defer End() on
		// the returned span, which would prematurely end an unrelated parent.
		return ctx, trace.SpanFromContext(context.Background())
	}
	if !safeTraceName.MatchString(name) {
		name = "internal.operation"
	}
	attrs := make([]attribute.KeyValue, 0, 2)
	if id := RequestID(ctx); id != "" {
		attrs = append(attrs, attribute.String("kgos.request_id", id))
	}
	if id := OperationID(ctx); id != "" {
		attrs = append(attrs, attribute.String("kgos.operation_id", id))
	}
	return observer.tracer.Start(ctx, name, trace.WithAttributes(attrs...))
}

// StartOperation assigns the KG OS operation ID at entry, not at completion.
// The OpenTelemetry Span owns its own distinct ID and parent relationship.
func StartOperation(ctx context.Context, name string) (context.Context, trace.Span) {
	if FromContext(ctx) == nil {
		return ctx, trace.SpanFromContext(context.Background())
	}
	id, err := newID("op_")
	if err != nil {
		return ctx, trace.SpanFromContext(context.Background())
	}
	ctx = context.WithValue(ctx, operationKeyType{}, id)
	return StartSpan(ctx, name)
}

func OperationID(ctx context.Context) string {
	id, _ := ctx.Value(operationKeyType{}).(string)
	return id
}

func activeSpanID(ctx context.Context) (string, string) {
	sc := trace.SpanContextFromContext(ctx)
	if !sc.IsValid() {
		return "", ""
	}
	return sc.TraceID().String(), sc.SpanID().String()
}

func SpanOutcome(span trace.Span, outcome string) {
	if span != nil && span.IsRecording() {
		switch outcome {
		case "committed", "applied", "no_change", "rejected", "failed", "unknown", "succeeded", "error", "incomplete":
			span.SetAttributes(attribute.String("kgos.outcome", outcome))
		}
	}
}

func (o *Observer) AttachStore(s *Store) {
	if o == nil || s == nil {
		return
	}
	o.store = s
	o.logger = slog.New(&storeHandler{store: s, level: o.level})
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(&spanStartProcessor{store: s}),
		sdktrace.WithBatcher(
			&sqliteSpanExporter{store: s},
			sdktrace.WithMaxQueueSize(256),
			sdktrace.WithMaxExportBatchSize(32),
			sdktrace.WithBatchTimeout(250*time.Millisecond),
			sdktrace.WithExportTimeout(1*time.Second),
		),
	)
	o.tracerProvider = tp
	o.tracer = tp.Tracer("kgos/observability")
	o.metricsStop = make(chan struct{})
	o.metricsDone = make(chan struct{})
	go o.sampleMetrics()
}

func (o *Observer) Close(ctx context.Context) error {
	if o == nil {
		return nil
	}
	var shutdownErr error
	if o.metricsStop != nil {
		close(o.metricsStop)
		select {
		case <-o.metricsDone:
		case <-ctx.Done():
			shutdownErr = errors.Join(shutdownErr, ctx.Err())
		}
		o.metricsStop = nil
	}
	if o.tracerProvider != nil {
		if err := o.tracerProvider.Shutdown(ctx); err != nil {
			shutdownErr = errors.Join(shutdownErr, err)
		}
	}
	if o.store != nil {
		shutdownErr = errors.Join(shutdownErr, o.store.Close(ctx))
	}
	return shutdownErr
}

func (o *Observer) Store() *Store {
	if o == nil {
		return nil
	}
	return o.store
}

type spanStartProcessor struct {
	store *Store
}

func (p *spanStartProcessor) OnStart(parent context.Context, span sdktrace.ReadWriteSpan) {
	if p.store == nil {
		return
	}
	sc := span.SpanContext()
	if !sc.IsValid() {
		return
	}
	requestID, operationID := RequestID(parent), OperationID(parent)
	if requestID == "" && operationID == "" {
		return
	}
	parentID := ""
	if span.Parent().IsValid() {
		parentID = span.Parent().SpanID().String()
	}
	p.store.SpanStart(spanRecord{
		TraceID: sc.TraceID().String(), SpanID: sc.SpanID().String(), ParentSpanID: parentID,
		RequestID: requestID, OperationID: operationID,
		Name: safeSpanName(span.Name()), Start: span.StartTime(),
	})
}

func (p *spanStartProcessor) OnEnd(sdktrace.ReadOnlySpan)      {}
func (p *spanStartProcessor) ForceFlush(context.Context) error { return nil }
func (p *spanStartProcessor) Shutdown(context.Context) error   { return nil }

type sqliteSpanExporter struct {
	store *Store
}

func (e *sqliteSpanExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	for _, span := range spans {
		if err := ctx.Err(); err != nil {
			return err
		}
		sc := span.SpanContext()
		if !sc.IsValid() {
			continue
		}
		parentID := ""
		if span.Parent().IsValid() {
			parentID = span.Parent().SpanID().String()
		}
		rec := spanRecord{
			TraceID: sc.TraceID().String(), SpanID: sc.SpanID().String(), ParentSpanID: parentID,
			Name: safeSpanName(span.Name()), Start: span.StartTime(), End: span.EndTime(),
			Outcome: "unknown",
		}
		for _, attr := range span.Attributes() {
			if attr.Value.Type() != attribute.STRING {
				continue
			}
			switch attr.Key {
			case "kgos.request_id":
				rec.RequestID = attr.Value.AsString()
			case "kgos.operation_id":
				rec.OperationID = attr.Value.AsString()
			case "kgos.outcome":
				rec.Outcome = attr.Value.AsString()
			}
		}
		if rec.RequestID != "" || rec.OperationID != "" {
			e.store.SpanEnd(rec)
		}
	}
	return nil
}

func (*sqliteSpanExporter) Shutdown(context.Context) error { return nil }

func safeSpanName(name string) string {
	if safeTraceName.MatchString(name) {
		return name
	}
	return "internal.operation"
}

// The handler is the only bridge from application slog to the diagnostic DB.
// It deliberately serializes only fixed, known fields, not arbitrary attr maps.
type storeHandler struct {
	store *Store
	level slog.Level
	attrs []slog.Attr
}

func (h *storeHandler) Enabled(_ context.Context, l slog.Level) bool { return l >= h.level }

func (h *storeHandler) Handle(ctx context.Context, rec slog.Record) error {
	if !h.Enabled(ctx, rec.Level) && !requiredDiagnosticEvent(rec.Message) {
		return nil
	}
	fields := map[string]any{}
	all := append([]slog.Attr(nil), h.attrs...)
	rec.Attrs(func(a slog.Attr) bool {
		all = append(all, a)
		return true
	})
	item := logRecord{Time: rec.Time, Level: rec.Level.String(), Event: safeSpanName(rec.Message)}
	for _, attr := range all {
		switch attr.Key {
		case "component":
			item.Component = safeSpanName(attr.Value.String())
		case "event":
			item.Event = safeSpanName(attr.Value.String())
		case "run_id":
			item.RunID = attr.Value.String()
		case "request_id":
			item.RequestID = attr.Value.String()
		case "operation_id":
			item.OperationID = attr.Value.String()
		case "trace_id":
			item.TraceID = attr.Value.String()
		case "span_id":
			item.SpanID = attr.Value.String()
		case "surface":
			switch attr.Value.String() {
			case "api", "web", "mcp", "internal":
				fields["surface"] = attr.Value.String()
			}
		case "route", "method", "tool", "operation", "outcome", "error_code", "cause_class", "stage", "auth_kind", "decision", "target_kind", "result_state":
			if len(attr.Value.String()) <= 160 {
				fields[attr.Key] = attr.Value.String()
			}
		case "duration_ms", "status", "affected_count":
			if attr.Value.Kind() == slog.KindInt64 {
				fields[attr.Key] = attr.Value.Int64()
			}
		}
	}
	if item.Component == "" {
		item.Component = "runtime"
	}
	if item.TraceID == "" {
		item.TraceID, item.SpanID = activeSpanID(ctx)
	}
	if item.RequestID == "" {
		item.RequestID = RequestID(ctx)
	}
	if item.OperationID == "" {
		item.OperationID = OperationID(ctx)
	}
	item.Fields = safeJSON(fields)
	h.store.Log(item)
	return nil
}

func (h *storeHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := &storeHandler{store: h.store, level: h.level, attrs: append([]slog.Attr(nil), h.attrs...)}
	next.attrs = append(next.attrs, attrs...)
	return next
}

func (h *storeHandler) WithGroup(_ string) slog.Handler { return h }
