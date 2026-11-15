FROM python:3.13-slim
WORKDIR /app
COPY app.py ./
COPY public ./public
RUN useradd --uid 10001 app && mkdir data && chown app:app data
USER app
ENV HOST=0.0.0.0 PORT=8000
EXPOSE 8000
CMD ["python", "app.py"]
