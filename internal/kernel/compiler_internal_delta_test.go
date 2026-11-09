package kernel

import "testing"

func TestInternalMetadataChanged(t *testing.T) {
	title, sameTitle := "Title", "Title"
	description, sameDescription := "Description", "Description"
	empty := ""
	cases := []struct {
		name           string
		oldName        string
		oldTitle       *string
		oldDescription *string
		newName        string
		newTitle       *string
		newDescription *string
		wantChanged    bool
	}{
		{name: "unmodified nil metadata", oldName: "Node", newName: "Node"},
		{name: "equal nonnil metadata", oldName: "Node", oldTitle: &title, oldDescription: &description, newName: "Node", newTitle: &sameTitle, newDescription: &sameDescription},
		{name: "name rename", oldName: "Node", newName: "Renamed", wantChanged: true},
		{name: "title added", oldName: "Node", newName: "Node", newTitle: &title, wantChanged: true},
		{name: "title removed", oldName: "Node", oldTitle: &title, newName: "Node", wantChanged: true},
		{name: "title replaced", oldName: "Node", oldTitle: &title, newName: "Node", newTitle: &description, wantChanged: true},
		{name: "description added", oldName: "Node", newName: "Node", newDescription: &description, wantChanged: true},
		{name: "description removed", oldName: "Node", oldDescription: &description, newName: "Node", wantChanged: true},
		{name: "nil and empty distinct", oldName: "Node", newName: "Node", newTitle: &empty, wantChanged: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			changed := internalMetadataChanged(tc.oldName, tc.oldTitle, tc.oldDescription,
				tc.newName, tc.newTitle, tc.newDescription)
			if changed != tc.wantChanged {
				t.Fatalf("internal metadata changed = %v, want %v", changed, tc.wantChanged)
			}
		})
	}
}
