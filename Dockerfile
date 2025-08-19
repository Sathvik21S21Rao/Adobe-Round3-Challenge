# ---------- Base OS ----------
FROM ubuntu:22.04

# Prevent tzdata from prompting during install
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV MONGODB_URI="mongodb://localhost:27017/pdf-analysis"
ENV JWT_SECRET="rockBottomUppercut"


# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl wget gnupg lsb-release \
    build-essential libpq-dev libffi-dev libssl-dev \
    ffmpeg supervisor python3 python3-pip python3-venv \
    tzdata  nginx \
    && rm -rf /var/lib/apt/lists/*


# ---------- Install MongoDB ----------
RUN wget -qO mongodb.tgz https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.20.tgz \
    && tar -xvzf mongodb.tgz -C /usr/local --strip-components=1 \
    && rm mongodb.tgz \
    && mkdir -p /data/db

# ---------- Node.js & Next.js ----------
# Install Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs 

# Set up Next.js app
WORKDIR /app/next
COPY nextServices/package*.json ./
RUN npm install
COPY nextServices/ ./

# ---------- Python Services ----------
WORKDIR /app/pythonServices
COPY pythonServices/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY pythonServices/ ./
RUN python3 download_nltk.py && python3 load_models.py

# ---------- Shared Uploads ----------
RUN mkdir -p /app/uploads

# ---------- Nginx Config ----------
RUN rm /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ---------- Supervisord ----------
WORKDIR /app
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
EXPOSE 80 8080 8000 27017

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

# ---------- Run ----------
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
