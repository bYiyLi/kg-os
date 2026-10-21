export const en = {
  ui: { closeNotification: "Close notification", notifications: "Notifications" },
  meta: { title: "KG OS", description: "KG OS knowledge graph workspace" },
  language: {
    label: "Interface language",
    system: "Follow system language",
    auto: "Auto",
    english: "English",
    chinese: "简体中文"
  },
  setup: {
    landmark: "KG OS setup",
    loading: "Checking Instance setup...",
    statusFailed: "Cannot check KG OS initialization status.",
    unavailableTitle: "Instance needs attention",
    unavailableDescription: "Initialization could not continue safely.",
    unavailableHelp:
      "Review the Instance configuration and service logs. Preserve the existing data, correct the problem, and restart KG OS.",
    retry: "Retry",
    stepNavigation: "Setup steps",
    setupLabel: "Initial setup",
    progress: "Step {{current}} of {{total}}",
    stages: {
      welcome: "Welcome to KG OS",
      publicOrigin: "Configure external access",
      vector: "Connect your vector service",
      auth: "Protect your KG OS Instance",
      initialize: "Initialize knowledge base"
    },
    description: {
      publicOrigin:
        "Your public address is the single entry point for KG OS. Web, API, and MCP share this origin, which ChatGPT also uses to connect and request authorization.",
      welcome:
        "Your own knowledge graph, ready for AI. We'll get everything set up in a few steps.",
      vector: "Set up the embedding service that enables KG OS to search knowledge by meaning.",
      auth: "The access token is the administrator credential for this KG OS Instance—like a master key to your knowledge base. Use it to sign in to the Web interface and authorize protected API or client operations on knowledge and configuration. Anyone holding it may act as an administrator, so keep it private and never share it publicly.",
      initialize: "Check your configuration, then prepare your knowledge base."
    },
    review: {
      title: "Review settings and initialize",
      tagline: "Everything is ready to set up your KG OS knowledge base",
      description:
        "Review your settings before you begin. KG OS will save the configuration, prepare its components, create the knowledge base, and check service readiness.",
      accessTitle: "Service access",
      semanticTitle: "Semantic search",
      basicsTitle: "Basic settings",
      mcpLabel: "MCP connection URL",
      localOnly: "This is a local address. ChatGPT Cloud cannot connect to it directly.",
      verified: "Vector service verified",
      jieba: "Jieba (Chinese tokenizer)",
      beforeStart:
        "Need to make a change? Go back to an earlier step. Initialization will not automatically overwrite existing knowledge.",
      runningTitle: "Preparing your KG OS",
      runningTagline: "Initialization is underway",
      runningDescription:
        "KG OS is saving the settings, preparing components, and creating the knowledge base. You can enter the workspace once the service is ready.",
      failedTitle: "Initialization is not complete",
      failedTagline: "Some initialization steps did not finish",
      failedDescription:
        "Existing configuration and data are preserved. Review the error, resolve the issue, then continue initialization."
    },
    vector: {
      tagline: "Find knowledge by meaning, not just by connections",
      intro:
        "Knowledge graphs give objects and relationships structure, but exact names and keywords aren't always easy to remember. Semantic search discovers related knowledge by meaning, even when the wording differs.",
      context:
        "KG OS turns text into vectors through an Embedding service. Use these defaults or connect your own service and model.",
      connectionTitle: "Service connection",
      connectionDescription:
        "KG OS uses this API to generate text vectors. Add an API key only if your service requires one.",
      modelTitle: "Model configuration",
      modelDescription:
        "The model maps text into vectors. Dimensions must match its output; similarity controls how vectors are compared.",
      modelLabel: "Model ID",
      similarityLabel: "Similarity",
      keyOptional: "(optional)",
      noKey: "No authentication",
      validationTitle: "Verify your vector service",
      validationDescription:
        "KG OS sends a real Embedding request to check connectivity, model availability, and output dimensions. A successful test unlocks the next step; otherwise, adjust your settings and retry.",
      test: "Test connection",
      testing: "Testing…",
      validationStates: {
        idle: "Not tested",
        testing: "Verifying your vector service…",
        success: "Verified · Model output {{dimensions}} dimensions",
        failed: "Verification failed"
      },
      testNetworkError: "Unable to complete the test. Check your connection.",
      testErrors: {
        setup_unavailable:
          "This Instance is no longer accepting verification. Refresh the page to check its setup status.",
        invalid_fields: "Check the URL, model, and dimensions.",
        address_not_allowed:
          "Loopback and special-purpose addresses cannot be tested. Check the API URL.",
        timeout: "The embedding service timed out. Try again.",
        connection_failed: "Could not connect to the embedding service.",
        redirect_not_allowed:
          "The embedding service redirected the request. Enter its final API URL.",
        authentication_failed: "Missing or invalid API key (HTTP {{status}}).",
        endpoint_or_model_not_found: "API URL or model was not found (HTTP {{status}}).",
        rate_limited: "The provider rate-limited the request (HTTP {{status}}).",
        provider_error: "The provider rejected the request (HTTP {{status}}).",
        provider_unavailable: "The provider is unavailable (HTTP {{status}}).",
        invalid_response: "The provider did not return a valid numeric embedding.",
        dimensions_mismatch:
          "The model returned {{dimensions}} dimensions, which does not match this setting.",
        busy: "Another test is already running. Try again.",
        unknown: "Verification failed. Check your settings and retry."
      }
    },
    publicOrigin: {
      tagline: "One address for ChatGPT and your other clients",
      context:
        "We've prefilled your browser's address. If you use a domain or reverse proxy, replace it with the HTTPS address your external clients can actually reach.",
      connectionTitle: "Service address",
      connectionDescription:
        "Enter the root address of this Instance. KG OS uses it to generate MCP and OAuth authorization URLs.",
      label: "External access address",
      hint: "For example, https://kgos.example.com. Do not add /mcp or another path.",
      invalid:
        "Enter a valid HTTPS origin without a path. HTTP is permitted only for local loopback development.",
      mcpLabel: "MCP connection URL (generated automatically)",
      localWarning:
        "This is a local address for development only. ChatGPT Cloud cannot connect to it. Configure a publicly reachable HTTPS domain before connecting ChatGPT.",
      help: "Make sure your HTTPS domain and reverse proxy are configured and reachable by external clients. Entering an address does not create public access."
    },
    welcome: {
      tagline: "Build an evolving world of knowledge for AI",
      intro:
        "KG OS is programmable knowledge graph infrastructure for AI. Define your own knowledge models, organize objects, properties, and relationships into a connected graph, and explore knowledge with graph queries, full-text search, and vector search.",
      evolution:
        "Keep changes in version history. AI works with knowledge through consistent interfaces, while you can review, manage, and correct it in the Web app.",
      featuresTitle: "What can KG OS do for you?",
      features: {
        structure: {
          title: "Define your knowledge structure",
          description:
            "Model objects, relationships, properties, and constraints with Ontology, without a fixed domain schema."
        },
        discovery: {
          title: "Connect, query, and discover",
          description:
            "Combine graph queries, full-text search, and vector search to discover related knowledge."
        },
        evolution: {
          title: "Let knowledge evolve",
          description:
            "Use Commit, Branch, and Diff to preserve history, compare changes, and track evolution."
        },
        ai: {
          title: "AI-first, human oversight",
          description:
            "AI works through CLI, Skill, and MCP; you manage and correct knowledge through the Web app."
        }
      },
      nextTitle: "Just four steps to get started"
    },
    url: "API URL",
    key: "API Key",
    keyPlaceholder: "Enter your embedding API key",
    showKey: "Show secret",
    hideKey: "Hide secret",
    model: "Embedding model",
    dimensions: "Vector dimensions",
    similarity: "Similarity",
    cosine: "Cosine similarity",
    euclidean: "Euclidean distance",
    analyzer: "Full-text analyzer",
    cacheSize: "Embedding cache",
    keyProvided: "API key configured",
    credentialMode: "API credential",
    authTagline: "Establish secure administrator access to your knowledge base",
    authIntroductionSecond:
      "KG OS generates a strong random token automatically; you don't need to create an account or set a password. Each token takes effect immediately, and its full value appears in the Web app only when created. After leaving or refreshing this step, an administrator with access to the Instance files can retrieve it from .kgos/auth.json. Regenerating revokes the old token and its login sessions, so other clients will need updated credentials.",
    authGenerateDescription:
      "Before setup is completed, you can regenerate the access token without entering the old one. This browser will then try to connect automatically. Copy and securely save the new token before continuing.",
    authCreatedTitle: "Access token created",
    authTokenCreated: "Instance access token",
    generateToken: "Generate access token",
    regenerateToken: "Regenerate access token",
    signIn: "Sign in",
    authReady:
      "Instance authentication is complete. This browser is signed in, and you can continue setup.",
    saveToken:
      "Copy and save this token in a safe place. The Web app won't show it again after you leave this step.",
    authLoginRetry:
      "The token has been created, but this browser is not signed in. Use this token to try signing in again.",
    copyToken: "Copy token",
    copySuccess: "Token copied. Save it in a secure location.",
    copyFailed: "Couldn't copy the token. Select and copy it manually.",
    authRequired: "Sign in with your Instance token to continue.",
    vectorInvalid: "Check the API URL, model, dimensions and API key.",
    actionFailed: "The operation could not be completed. Try again.",
    previewAction: "This action is unavailable in preview mode.",
    initializing: "Preparing your knowledge base",
    resumeHint: "If initialization stopped, sign in and retry using the existing configuration.",
    phases: {
      configuration: "Configuration",
      extensions: "Extensions",
      authentication: "Access token",
      database: "Database",
      readiness: "Readiness"
    },
    back: "Back",
    start: "Get started",
    next: "Next",
    initialize: "Initialize knowledge base"
  },
  auth: {
    restoring: "Restoring your KG OS session...",
    logoutFailed: "Could not end your session. Please try again.",
    brandDescription: "KNOWLEDGE GRAPH OPERATING SYSTEM",
    title: "Authentication Required",
    descriptionFirst: "Enter your access token to connect to this KG OS instance.",
    descriptionSecond: "All data is protected and requires authentication.",
    accessToken: "Access Token",
    placeholder: "Paste your access token here...",
    showToken: "Show access token",
    hideToken: "Hide access token",
    tokenNote: "Your token is only stored in memory and never saved to disk.",
    connect: "Connect",
    connecting: "Connecting...",
    helpTitle: "Need help?",
    helpDescription: "You can find your access token in:",
    viewDocs: "View Documentation",
    footer: "Same data. Deeper understanding.",
    error: {
      required: "Enter your access token to continue.",
      invalid: "Invalid access token. Check your token and try again.",
      transport: "Cannot reach the KG OS instance. Please try again.",
      unknown: "Unable to connect to KG OS. Please try again."
    },
    loss: {
      changed: "The KG OS service has changed. Reconnect to continue safely.",
      expired: "Your access token is no longer valid. Reconnect to continue.",
      offline: "The KG OS service is offline. Reconnect when it is available."
    }
  },
  versions: {
    navigation: "Version navigation",
    mobileNavigation: "Mobile version navigation",
    closeNavigation: "Close version navigation",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    collapseHint: "Click to collapse · Drag or use arrow keys to resize",
    history: "Commit history",
    tree: "Version browser",
    branches: "Branches",
    filterBranches: "Filter branches",
    allBranches: "All branches",
    selectedBranches: "Selected branches",
    selectAll: "Select all",
    clearAll: "Clear all",
    searchCommits: "Search commits...",
    noBranchesSelected: "Select a branch to show commits.",
    noMatchingCommits: "No matching commits.",
    noBranches: "No branches are available.",
    unavailable: "Connect to view version history.",
    noMessage: "No commit message",
    loading: "Loading history...",
    loadFailed: "Could not load version history. Try again.",
    selectFailed: "Could not open this version. Your previous selection is unchanged.",
    loadMore: "Load more",
    loadedOnly: "Search and colors reflect loaded history only.",
    refresh: "Refresh versions",
    reachableFrom: "Reachable from: {{names}}",
    merge: "Merge",
    disconnect: "Disconnect",
    appearance: "Appearance theme",
    system: "Follow system theme",
    light: "Light theme",
    dark: "Dark theme"
  },
  workspace: {
    label: "Visual workspace",
    canvas: "Graph canvas",
    pendingTools: "Canvas tools (coming soon)",
    pendingAction: "{{name}} (coming soon)",
    select: "Select tool",
    layout: "Graph layout",
    fit: "Fit canvas",
    minimap: "Canvas overview",
    zoom: "Zoom (coming soon)",
    pendingCanvas: "Canvas content coming soon"
  },
  embedded: {
    title: "Current knowledge version",
    refresh: "Refresh",
    loading: "Reading KG OS...",
    unavailable: "KG OS is unavailable. Check your connection and refresh.",
    branch: "Default branch",
    commit: "Commit"
  },
  mcp: {
    title: "Authorize Connection",
    description: "ChatGPT wants to connect to your KG OS instance.",
    cancelConnection: "Cancel connection",
    externalAssistant: "External AI Assistant",
    yourGraph: "Your Knowledge Graph",
    loading: "Loading connection request...",
    permissionsTitle: "This application will be able to:",
    readName: "Read knowledge",
    readDescription: "Access your nodes, relationships, and graph data",
    writeName: "Modify knowledge",
    writeDescription: "Create, update, and delete graph data",
    branchesName: "Manage branches",
    branchesDescription: "Create, change, and delete branches",
    executeName: "Execute operations",
    executeDescription: "Run queries and knowledge graph operations",
    requested: "Requested",
    writeNotice: "This connection includes write access.",
    trustNotice: "Only authorize applications you trust. Your Instance credential is never shared.",
    cancel: "Cancel",
    authorize: "Authorize Connection",
    authorizing: "Authorizing...",
    footnote: "By continuing, you trust ChatGPT to access this KG OS instance.",
    error: {
      unavailable: "This connection request is unavailable. Start again from ChatGPT.",
      failed: "Could not complete authorization. Start again from ChatGPT."
    }
  }
} as const;
