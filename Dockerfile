# Stage 1: build the Rust binary + Python wheel
FROM rust:1.80-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-dev python3-pip pkg-config libssl-dev libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.toml
COPY openpika-core/ openpika-core/

# Cache dependencies layer
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --bin openpika

# Build the Python wheel
COPY openpika-python/ openpika-python/
RUN pip3 install --no-cache-dir build && \
    cd openpika-python && python3 -m build --wheel

# Stage 2: minimal runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip libsqlite3-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/openpika /usr/local/bin/openpika
COPY --from=builder /build/openpika-python/dist/*.whl /tmp/

RUN pip3 install --no-cache-dir /tmp/*.whl && rm /tmp/*.whl

RUN useradd -m -u 1000 openpika
USER openpika

WORKDIR /home/openpika
EXPOSE 8080

ENV DATABASE_URL="sqlite:///home/openpika/.openpika/state.db"

CMD ["openpika", "serve"]
