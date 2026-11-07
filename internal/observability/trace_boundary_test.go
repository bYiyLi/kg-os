package observability

import (
	"context"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func TestMissingObserverDoesNotEndUnrelatedParentSpan(t *testing.T) {
	provider := sdktrace.NewTracerProvider()
	defer func() { _ = provider.Shutdown(context.Background()) }()
	parentCtx, parent := provider.Tracer("test").Start(context.Background(), "parent")
	defer parent.End()
	if !parent.SpanContext().IsValid() {
		t.Fatal("test parent must be a valid recording Span")
	}
	_, missing := StartSpan(parentCtx, "kernel.graph.query")
	_, missingOperation := StartOperation(parentCtx, "kernel.graph.execute")
	if missing.SpanContext().IsValid() || missingOperation.SpanContext().IsValid() {
		t.Fatal("missing KG OS observer returned a foreign active parent span")
	}
	missing.End()
	missingOperation.End()
	if !parent.SpanContext().IsValid() {
		t.Fatal("fallback span changed the active parent")
	}
}
