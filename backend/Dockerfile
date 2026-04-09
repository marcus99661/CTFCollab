FROM rust:trixie AS builder
WORKDIR /app

# ── Dependency cache layer ────────────────────────────────────────────────────
# Copy only the manifests and build a stub binary so all crate dependencies get
# compiled and stored in a Docker layer. This layer is reused on every rebuild
# as long as Cargo.toml / Cargo.lock don't change.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
# Remove the stub artifacts so Cargo recompiles the real source next step.
RUN rm -rf src target/release/deps/ctfcollab*

# ── Application build ─────────────────────────────────────────────────────────
COPY . .
RUN cargo build --release

FROM debian:trixie-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/ctfcollab /app/ctfcollab
ENV BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
CMD ["/app/ctfcollab"]
