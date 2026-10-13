package mcpserver

import (
	"fmt"
	"strconv"
	"strings"
)

type indexedLine struct {
	index  int
	render func() string
}

type viewAnchor struct {
	start, end        int
	started, finished bool
}
type viewDoc struct {
	lines      []string
	anchors    map[int]*viewAnchor
	next       int
	indexLines []indexedLine
	lastLine   int
}

func newViewDoc() *viewDoc      { return &viewDoc{anchors: make(map[int]*viewAnchor)} }
func (d *viewDoc) reserve() int { d.next++; d.anchors[d.next] = &viewAnchor{}; return d.next }
func (d *viewDoc) begin(id int) error {
	a := d.anchors[id]
	if a == nil || a.started {
		return fmt.Errorf("invalid view anchor %d", id)
	}
	a.started = true
	a.start = len(d.lines)
	return nil
}
func (d *viewDoc) end(id int) error {
	a := d.anchors[id]
	if a == nil || !a.started || a.finished {
		return fmt.Errorf("invalid view anchor %d", id)
	}
	a.finished = true
	a.end = len(d.lines)
	return nil
}
func (d *viewDoc) offset(id int) string { return strconv.Itoa(d.anchors[id].start) }
func (d *viewDoc) length(id int) string {
	return strconv.Itoa(min(d.anchors[id].end, d.lastLine) - d.anchors[id].start)
}

// Render navigation rows after all anchors are closed. No string placeholder
// is ever scanned, so even user-controlled text that resembles an anchor is
// preserved verbatim in a navigation title or description.
func (d *viewDoc) addIndexLine(render func() string) {
	d.indexLines = append(d.indexLines, indexedLine{index: len(d.lines), render: render})
	d.lines = append(d.lines, "")
}
func (d *viewDoc) finish() ([]string, error) {
	end := len(d.lines)
	for end > 0 && d.lines[end-1] == "" {
		end--
	}
	result := make([]string, end)
	d.lastLine = end
	for id, a := range d.anchors {
		if !a.started || !a.finished {
			return nil, fmt.Errorf("unclosed view anchor %d", id)
		}
	}
	copy(result, d.lines[:end])
	for _, item := range d.indexLines {
		if item.index >= end {
			return nil, fmt.Errorf("trimmed navigation line")
		}
		result[item.index] = item.render()
	}
	if len(strings.Join(result, "\n"))+1 > maxMarkdownBytes {
		return nil, fmt.Errorf("RESOURCE_ERROR: Markdown view exceeds budget")
	}
	return result, nil
}
