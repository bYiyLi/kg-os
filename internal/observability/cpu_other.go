//go:build !linux && !darwin

package observability

type cpuSample struct {
	seconds float64
	ok      bool
}

func processCPUSeconds() cpuSample { return cpuSample{} }
