// Package webstore owns recoverable Web input and disposable query results. It
// opens ordinary SQLite and has no dependency on the Knowledge database host.
package webstore

import (
	"encoding/json"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const (
	FormatVersion                   = 1
	RecordLimit                     = 8 << 20
	LogicalLimit                    = 64 << 20
	PhysicalLimit                   = 256 << 20
	CacheItemLimit                  = 8 << 20
	CacheLimit                      = 128 << 20
	CodeChanged    kernel.ErrorCode = "WEB_DATA_CHANGED"
	CodeNotFound   kernel.ErrorCode = "WEB_DATA_NOT_FOUND"
)

type Usage struct {
	LogicalBytes  int64 `json:"logicalBytes"`
	DatabaseBytes int64 `json:"databaseBytes"`
	WALBytes      int64 `json:"walBytes"`
	CacheBytes    int64 `json:"cacheBytes"`
}

type Info struct {
	StorageStatus     string              `json:"storageStatus"`
	FormatVersion     int                 `json:"formatVersion,omitempty"`
	StoreID           string              `json:"storeId,omitempty"`
	DatabaseID        string              `json:"databaseId,omitempty"`
	CurrentDatabaseID string              `json:"currentDatabaseId,omitempty"`
	BindingStatus     string              `json:"bindingStatus,omitempty"`
	Usage             *Usage              `json:"usage,omitempty"`
	Error             *kernel.PublicError `json:"error,omitempty"`
}

type Header struct {
	Kind           string `json:"kind"`
	ID             string `json:"id"`
	Revision       string `json:"revision"`
	Deleted        bool   `json:"deleted"`
	LastMutationID string `json:"lastMutationId"`
}

type Record struct {
	Header
	Data json.RawMessage `json:"data"`
}

type ReadRequest struct {
	StoreID string `json:"storeId"`
	Kind    string `json:"kind"`
	ID      string `json:"id"`
}

type ListRequest struct {
	StoreID string `json:"storeId"`
	Kind    string `json:"kind"`
	Limit   *int   `json:"limit,omitempty"`
	Cursor  string `json:"cursor,omitempty"`
}

type ListResult struct {
	Items  []Header `json:"items"`
	Cursor string   `json:"cursor,omitempty"`
}

type SaveRequest struct {
	ReadRequest
	ExpectedRevision *string         `json:"expectedRevision"`
	MutationID       string          `json:"mutationId"`
	Data             json.RawMessage `json:"data"`
}

type DeleteRequest struct {
	ReadRequest
	ExpectedRevision *string `json:"expectedRevision"`
	MutationID       string  `json:"mutationId"`
}

type CacheRequest struct {
	StoreID string `json:"storeId"`
	FrameID string `json:"frameId"`
}

type CacheWriteRequest struct {
	CacheRequest
	FrameRevision string      `json:"frameRevision"`
	Result        CacheResult `json:"result"`
}

type CacheResult struct {
	State         string              `json:"state"`
	Columns       []string            `json:"columns"`
	Rows          [][]json.RawMessage `json:"rows"`
	ValueEncoding string              `json:"valueEncoding"`
}

type CacheReadResult struct {
	Hit    bool         `json:"hit"`
	Result *CacheResult `json:"result,omitempty"`
}

type CacheWriteResult struct {
	Stored bool `json:"stored"`
}

type CacheClearRequest struct {
	StoreID string `json:"storeId"`
}

type CacheClearResult struct {
	Cleared int `json:"cleared"`
}
