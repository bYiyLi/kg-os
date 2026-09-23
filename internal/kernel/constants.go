package kernel

const (
	internalLabel               = "__kgos_internal"
	definitionBindingLabel      = "__kgos_definition_binding"
	propertyBindingLabel        = "__kgos_property_binding"
	domainLabel                 = "__kgos_domain"
	propertyOfType              = "__kgos_property_of"
	includesType                = "__kgos_includes"
	internalKindProperty        = "__kgos_kind"
	internalNameProperty        = "__kgos_name"
	internalTitleProperty       = "__kgos_title"
	internalDescriptionProperty = "__kgos_description"
)

const reservedGraphType = "{(" +
	":" + definitionBindingLabel + " => :" + internalLabel +
	" {" + internalKindProperty + " :: STRING NOT NULL, " +
	internalNameProperty + " :: STRING NOT NULL, " +
	internalTitleProperty + " :: STRING, " +
	internalDescriptionProperty + " :: STRING}), (" +
	":" + propertyBindingLabel + " => :" + internalLabel +
	" {" + internalNameProperty + " :: STRING NOT NULL, " +
	internalTitleProperty + " :: STRING, " +
	internalDescriptionProperty + " :: STRING}), (" +
	":" + domainLabel + " => :" + internalLabel +
	" {" + internalNameProperty + " :: STRING NOT NULL, " +
	internalTitleProperty + " :: STRING, " +
	internalDescriptionProperty + " :: STRING}), (" +
	":" + propertyBindingLabel + ")-[:" + propertyOfType + " => {}]->(:" +
	definitionBindingLabel + "), (:" + domainLabel + ")-[:" + includesType +
	" => {}]->(:" + internalLabel + ")}"
