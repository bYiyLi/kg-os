package mcpsandbox

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"

	qjs "github.com/aperturerobotics/go-quickjs-wasi-reactor"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

type guest struct {
	rt     wazero.Runtime
	mod    api.Module
	ctx    uint64
	jsrt   uint64
	driver uint64
}

func newGuest(ctx context.Context, memoryPages uint32) (_ *guest, err error) {
	g := &guest{rt: wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfig().WithCloseOnContextDone(true).WithMemoryLimitPages(memoryPages))}
	defer func() {
		if err != nil {
			_ = g.Close(context.Background())
		}
	}()
	if _, err = wasi_snapshot_preview1.Instantiate(ctx, g.rt); err != nil {
		return nil, err
	}
	compiled, e := g.rt.CompileModule(ctx, qjs.QuickJSWASM)
	if e != nil {
		return nil, e
	}
	defer compiled.Close(ctx)
	g.mod, err = g.rt.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("qjs-wasi"))
	if err != nil {
		return nil, err
	}
	if _, err = g.call(ctx, "_initialize"); err != nil {
		return nil, err
	}
	ptr, e := g.alloc(ctx, []byte{'q', 'j', 's', 0})
	if e != nil {
		return nil, e
	}
	defer g.free(ctx, ptr)
	argv, e := g.alloc(ctx, make([]byte, 4))
	if e != nil {
		return nil, e
	}
	defer g.free(ctx, argv)
	if !g.mod.Memory().WriteUint32Le(argv, ptr) {
		return nil, errors.New("argv write failed")
	}
	out, e := g.call(ctx, "qjs_init_argv", 1, uint64(argv))
	if e != nil {
		return nil, e
	}
	if int32(out[0]) != 0 {
		return nil, errors.New("qjs init failed")
	}
	out, e = g.call(ctx, "qjs_get_context")
	if e != nil {
		return nil, e
	}
	g.ctx = out[0]
	out, e = g.call(ctx, "JS_GetRuntime", g.ctx)
	if e != nil {
		return nil, e
	}
	g.jsrt = out[0]
	if g.ctx == 0 || g.jsrt == 0 {
		return nil, errors.New("null QuickJS context")
	}
	if _, err = g.call(ctx, "JS_SetMemoryLimit", g.jsrt, uint64(memoryPages)*65536/2); err != nil {
		return nil, err
	}
	if _, err = g.call(ctx, "JS_SetMaxStackSize", g.jsrt, 512*1024); err != nil {
		return nil, err
	}
	// Block guest's dynamic import of QuickJS std/os modules. No env/fs/network are mounted to WASI.
	if _, err = g.call(ctx, "JS_SetModuleLoaderFunc", g.jsrt, 0, 0, 0); err != nil {
		return nil, err
	}
	return g, nil
}
func (g *guest) call(ctx context.Context, name string, args ...uint64) ([]uint64, error) {
	f := g.mod.ExportedFunction(name)
	if f == nil {
		return nil, fmt.Errorf("missing export %q", name)
	}
	return f.Call(ctx, args...)
}
func (g *guest) alloc(ctx context.Context, b []byte) (uint32, error) {
	r, err := g.call(ctx, "malloc", uint64(len(b)))
	if err != nil {
		return 0, err
	}
	p := uint32(r[0])
	if p == 0 {
		return 0, errors.New("WASM malloc returned null")
	}
	if !g.mod.Memory().Write(p, b) {
		return 0, errors.New("WASM write out of bounds")
	}
	return p, nil
}
func (g *guest) free(ctx context.Context, p uint32) {
	if p != 0 {
		_, _ = g.call(ctx, "free", uint64(p))
	}
}
func (g *guest) freeValue(ctx context.Context, value uint64) {
	_, _ = g.call(ctx, "JS_FreeValue", g.ctx, value)
}
func (g *guest) jsString(ctx context.Context, s string) (uint64, error) {
	p, err := g.alloc(ctx, []byte(s))
	if err != nil {
		return 0, err
	}
	defer g.free(ctx, p)
	out, err := g.call(ctx, "JS_NewStringLen", g.ctx, uint64(p), uint64(len(s)))
	if err != nil {
		return 0, err
	}
	return out[0], nil
}
func (g *guest) stringValue(ctx context.Context, value uint64) (string, error) {
	sizePtr, err := g.alloc(ctx, make([]byte, 4))
	if err != nil {
		return "", err
	}
	defer g.free(ctx, sizePtr)
	out, err := g.call(ctx, "JS_ToCStringLen2", g.ctx, uint64(sizePtr), value, 0)
	if err != nil {
		return "", err
	}
	if out[0] == 0 {
		return "", errors.New("cannot serialize QuickJS value")
	}
	defer g.call(ctx, "JS_FreeCString", g.ctx, out[0])
	size, ok := g.mod.Memory().ReadUint32Le(sizePtr)
	if !ok {
		return "", errors.New("WASM size read failed")
	}
	// The largest configured script result is 16 MiB. Leave space for its
	// driver status envelope while still bounding all guest-to-host messages.
	if size > 16<<20+2048 {
		return "", errors.New("QuickJS message is too large")
	}
	raw, ok := g.mod.Memory().Read(uint32(out[0]), size)
	if !ok {
		return "", errors.New("WASM value read failed")
	}
	return string(raw), nil
}
func (g *guest) jsError(ctx context.Context) error {
	val, err := g.call(ctx, "JS_GetException", g.ctx)
	if err != nil {
		return err
	}
	defer g.freeValue(ctx, val[0])
	s, err := g.stringValue(ctx, val[0])
	if err != nil {
		return err
	}
	return fmt.Errorf("QuickJS exception: %s", s)
}
func (g *guest) eval(ctx context.Context, code string) (uint64, error) {
	p, err := g.alloc(ctx, []byte(code))
	if err != nil {
		return 0, err
	}
	defer g.free(ctx, p)
	f, err := g.alloc(ctx, []byte("<kgos>\x00"))
	if err != nil {
		return 0, err
	}
	defer g.free(ctx, f)
	res, err := g.call(ctx, "JS_Eval", g.ctx, uint64(p), uint64(len(code)), uint64(f), 0)
	if err != nil {
		return 0, err
	}
	if uint32(res[0]>>32) == uint32(qjs.JSTagException) {
		return 0, g.jsError(ctx)
	}
	return res[0], nil
}
func (g *guest) get(ctx context.Context, value uint64, key string) (uint64, error) {
	p, err := g.alloc(ctx, append([]byte(key), 0))
	if err != nil {
		return 0, err
	}
	defer g.free(ctx, p)
	out, err := g.call(ctx, "JS_GetPropertyStr", g.ctx, value, uint64(p))
	if err != nil {
		return 0, err
	}
	if uint32(out[0]>>32) == uint32(qjs.JSTagException) {
		return 0, g.jsError(ctx)
	}
	return out[0], nil
}
func (g *guest) method(ctx context.Context, key string, args ...string) (string, error) {
	f, err := g.get(ctx, g.driver, key)
	if err != nil {
		return "", err
	}
	defer g.freeValue(ctx, f)
	ptrs := make([]uint64, len(args))
	for i, arg := range args {
		ptrs[i], err = g.jsString(ctx, arg)
		if err != nil {
			return "", err
		}
		defer g.freeValue(ctx, ptrs[i])
	}
	argv := uint32(0)
	if len(ptrs) > 0 {
		buf := make([]byte, len(ptrs)*8)
		for i, v := range ptrs {
			binary.LittleEndian.PutUint64(buf[i*8:], v)
		}
		argv, err = g.alloc(ctx, buf)
		if err != nil {
			return "", err
		}
		defer g.free(ctx, argv)
	}
	out, err := g.call(ctx, "JS_Call", g.ctx, f, g.driver, uint64(len(ptrs)), uint64(argv))
	if err != nil {
		return "", err
	}
	val := out[0]
	if uint32(val>>32) == uint32(qjs.JSTagException) {
		return "", g.jsError(ctx)
	}
	defer g.freeValue(ctx, val)
	return g.stringValue(ctx, val)
}
func (g *guest) drainJobs(ctx context.Context) error {
	for i := 0; i < 1024; i++ {
		out, err := g.call(ctx, "JS_IsJobPending", g.jsrt)
		if err != nil {
			return err
		}
		if out[0] == 0 {
			return nil
		}
		// One owner Goroutine drives JS job queue; host callbacks never enter the VM concurrently.
		out, err = g.call(ctx, "JS_ExecutePendingJob", g.jsrt, 0)
		if err != nil {
			return err
		}
		if int32(out[0]) < 0 {
			return g.jsError(ctx)
		}
	}
	return nil
}
func (g *guest) Close(ctx context.Context) error {
	if g.mod != nil {
		if g.driver != 0 && !g.mod.IsClosed() {
			g.freeValue(ctx, g.driver)
		}
		_ = g.mod.Close(ctx)
	}
	if g.rt != nil {
		return g.rt.Close(ctx)
	}
	return nil
}
