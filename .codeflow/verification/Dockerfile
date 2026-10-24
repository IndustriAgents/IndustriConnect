FROM node@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv mosquitto \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/uv-tools \
    && /opt/uv-tools/bin/pip install --no-cache-dir uv==0.13.5 \
    && ln -s /opt/uv-tools/bin/uv /usr/local/bin/uv
ENV UV_CACHE_DIR=/opt/uv-cache UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy npm_config_cache=/opt/npm-cache
COPY source/ /cache-source/
COPY setup.sh /usr/local/bin/industriconnect-setup
COPY check.py /usr/local/bin/industriconnect-check
RUN chmod +x /usr/local/bin/industriconnect-setup /usr/local/bin/industriconnect-check \
    && cd /cache-source && CODEFLOW_PREPARE_ONLINE=1 industriconnect-setup \
    && rm -rf /cache-source \
    && chmod -R a+rwX /opt/uv-cache /opt/npm-cache
ENV UV_OFFLINE=1 npm_config_offline=true
