FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    YOLO_AUTOINSTALL=false \
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    MPLCONFIGDIR=/tmp/matplotlib \
    QUALITY_HOST=0.0.0.0 \
    QUALITY_PORT=7860 \
    QUALITY_WARMUP=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu
COPY services/quality/requirements.txt services/quality/requirements.txt
RUN pip install --no-cache-dir -r services/quality/requirements.txt
COPY services/quality/infer.py services/quality/infer.py
COPY yolo_best_weights/detector_yolo26s_best.pt yolo_best_weights/detector_yolo26s_best.pt
COPY yolo_best_weights/ripeness_yolo26s-cls_best.pt yolo_best_weights/ripeness_yolo26s-cls_best.pt
RUN useradd --uid 1000 --create-home worker && chown -R worker:worker /app
USER worker
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT',os.environ.get('QUALITY_PORT','7860'))+'/health',timeout=4)"
CMD ["python", "services/quality/infer.py", "--serve"]
