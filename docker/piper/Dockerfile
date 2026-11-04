# Piper text-to-speech HTTP server for the Cadence daily brief
# (docs/39-daily-brief.md, Audio; docs/piper README in docker/piper/README.md).
FROM python:3.12-slim

# piper-tts 1.8.0 (PyPI, 2026-09-04): the "http" extra provides piper.http_server.
RUN pip install --no-cache-dir "piper-tts[http]==1.8.0"

# Not root: the server only reads the voices folder.
RUN groupadd --system --gid 1000 piper && \
    useradd --system --uid 1000 --gid piper --home-dir /voices piper && \
    mkdir -p /voices && \
    chown piper:piper /voices

# Voices downloaded once with piper.download_voices (README), then read-only use.
VOLUME ["/voices"]

ENV PIPER_VOICE=fr_FR-siwis-medium

USER piper
WORKDIR /voices

EXPOSE 5000

# Shell form so PIPER_VOICE from the environment is read at start.
CMD python -m piper.http_server --host 0.0.0.0 --port 5000 --data-dir /voices -m ${PIPER_VOICE}
