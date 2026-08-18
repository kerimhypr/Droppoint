# Mobile adapters

The Rust core is embedded through UniFFI/FFI by the production mobile shell. The
platform entry points below are intentionally tiny: they receive native share
intents and hand the URI/text to the core, so no HTTP server or cloud account is
needed.

