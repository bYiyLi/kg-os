package observability

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Resource snapshots have their own bounded sampling cadence, not one write
// per request. Missing host sources are represented by nil, never invented.
func (o *Observer) sampleMetrics() {
	defer close(o.metricsDone)
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	lastTime, lastCPU := time.Now(), processCPUSeconds()
	pressure := o.captureResourceSample(lastTime, nil)
	if pressure {
		o.store.System(systemRecord{Time: lastTime.UTC(), RunID: o.runID, Event: "runtime.memory_pressure"})
	}
	for {
		select {
		case <-o.metricsStop:
			return
		case now := <-ticker.C:
			var pct *float64
			if cpu := processCPUSeconds(); cpu.ok {
				if lastCPU.ok && now.After(lastTime) && cpu.seconds >= lastCPU.seconds {
					value := 100 * (cpu.seconds - lastCPU.seconds) / now.Sub(lastTime).Seconds()
					pct = &value
				}
				lastCPU = cpuSample{seconds: cpu.seconds, ok: true}
			}
			lastTime = now
			observed := o.captureResourceSample(now, pct)
			// Record only transitions into a pressure state. Do not write a
			// warning every 15 seconds or invent pressure on unsupported hosts.
			if observed && !pressure {
				o.store.System(systemRecord{Time: now.UTC(), RunID: o.runID, Event: "runtime.memory_pressure"})
			}
			pressure = observed
		}
	}
}

func (o *Observer) captureResourceSample(now time.Time, cpuPercent *float64) bool {
	if o.store == nil {
		return false
	}
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	sample := metricRecord{
		Time:       now.UTC(),
		HeapBytes:  mem.HeapAlloc,
		Goroutines: runtime.NumGoroutine(),
		GCPauses:   mem.PauseTotalNs,
		RSSBytes:   procRSS(),
		CgroupUsed: readUnsignedFile("/sys/fs/cgroup/memory.current"),
		CgroupMax:  readUnsignedFile("/sys/fs/cgroup/memory.max"),
		CPUPercent: cpuPercent,
	}
	o.store.Metric(sample)
	return sample.CgroupUsed != nil && sample.CgroupMax != nil && *sample.CgroupMax > 0 &&
		float64(*sample.CgroupUsed)/float64(*sample.CgroupMax) >= 0.9
}

func readUnsignedFile(path string) *uint64 {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	n, err := strconv.ParseUint(strings.TrimSpace(string(data)), 10, 64)
	if err != nil {
		return nil
	}
	return &n
}

func procRSS() *uint64 {
	if runtime.GOOS != "linux" {
		return nil
	}
	raw, err := os.ReadFile("/proc/self/statm")
	if err != nil {
		return nil
	}
	parts := strings.Fields(string(raw))
	if len(parts) < 2 {
		return nil
	}
	pages, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil {
		return nil
	}
	n := pages * uint64(os.Getpagesize())
	return &n
}
