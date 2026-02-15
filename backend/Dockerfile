FROM rust AS builder
WORKDIR /app
COPY . .
RUN cargo build --release
#RUN cargo build

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/baka /app/baka
ENV BIND_ADDR=0.0.0.0:3000
EXPOSE 3000
CMD ["/app/baka"]
