//go:build linux || darwin

package observability

import "syscall"

type cpuSample struct {
	seconds float64
	ok      bool
}

func processCPUSeconds() cpuSample {
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		return cpuSample{}
	}
	return cpuSample{
		seconds: float64(usage.Utime.Sec+usage.Stime.Sec) +
			float64(usage.Utime.Usec+usage.Stime.Usec)/1e6,
		ok: true,
	}
}
