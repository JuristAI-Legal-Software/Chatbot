# Vendored copy of django-hub/mcp_server (source of truth: django-hub repo).
# Lives here so the sidecar image can build with Chatbot's existing AWS/ECR
# credentials, avoiding a cross-repo checkout token for a private repo.
# If django-hub/mcp_server/server.py changes, re-sync this copy by hand
# until a proper cross-repo sync mechanism exists.
FROM python:3.12.7-slim-bookworm

WORKDIR /app

COPY mcp_server/requirements.txt ./mcp_server/requirements.txt
RUN pip install --no-cache-dir -r mcp_server/requirements.txt

COPY mcp_server ./mcp_server

ENV PYTHONUNBUFFERED=1
EXPOSE 8001

CMD ["uvicorn", "mcp_server.server:app", "--host", "0.0.0.0", "--port", "8001"]
