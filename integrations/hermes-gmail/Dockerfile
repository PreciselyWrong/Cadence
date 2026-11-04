# Restricted Gmail MCP server over HTTP, in its own container.
# Standard library only: no package is installed. Runs as a non-root user and works with a
# read-only root filesystem; the OAuth state lives in the /state volume, the bearer token in /secrets.
FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY gmail_restricted/ /app/gmail_restricted/
COPY gmail_restricted_mcp.py setup_oauth.py /app/

# Override at run time (--user) to match the owner of the state volume on the host.
USER 10001:10001
VOLUME ["/state"]
EXPOSE 8700

ENTRYPOINT ["python", "-I", "-B", "/app/gmail_restricted_mcp.py"]
CMD ["--transport", "http", "--bind", "0.0.0.0", "--port", "8700", \
     "--accounts", "/state/accounts.json", "--state-dir", "/state", "--token-file", "/secrets/mcp_token"]
