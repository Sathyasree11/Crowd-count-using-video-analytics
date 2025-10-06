from flask import Flask, render_template, request, send_file, redirect, url_for, jsonify, send_from_directory, session, flash
import os, csv, time, json
import pymysql
# Note: per user request, passwords are stored in plaintext (no hashing)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
COUNTS_CSV = os.path.join(BASE_DIR, 'counts_log.csv')
ZONES_FILE = os.path.join(BASE_DIR, 'zones.json')
app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'dev-secret-key-change-me')

# MySQL configuration via environment variables
DB_CONFIG = {
    'host': os.environ.get('MYSQL_HOST', 'localhost'),
    'user': os.environ.get('MYSQL_USER', 'root'),
    'password': os.environ.get('MYSQL_PASSWORD', 'Harish@123'),
    'database': os.environ.get('MYSQL_DB', 'flask_zone_app'),
    'port': int(os.environ.get('MYSQL_PORT', '3306')),
    'cursorclass': pymysql.cursors.DictCursor,
    'autocommit': True,
}

def get_db_connection():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        return conn
    except Exception:
        return None

def ensure_tables():
    conn = get_db_connection()
    if not conn:
        return
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  username VARCHAR(255) UNIQUE NOT NULL,
                  password_hash VARCHAR(255) NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS videos (
                  id BIGINT AUTO_INCREMENT PRIMARY KEY,
                  user_id INT NULL,
                  filename VARCHAR(512) NOT NULL,
                  original_name VARCHAR(512) NOT NULL,
                  mime_type VARCHAR(128) NULL,
                  size_bytes BIGINT NULL,
                  data LONGBLOB NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  INDEX (user_id),
                  CONSTRAINT fk_videos_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            # Ensure file_path column exists even if table was created previously without it
            try:
                cur.execute("ALTER TABLE videos ADD COLUMN IF NOT EXISTS file_path VARCHAR(1024) NULL AFTER filename;")
            except Exception:
                try:
                    # Fallback for older MySQL versions without IF NOT EXISTS support
                    cur.execute("SHOW COLUMNS FROM videos LIKE 'file_path';")
                    col = cur.fetchone()
                    if not col:
                        cur.execute("ALTER TABLE videos ADD COLUMN file_path VARCHAR(1024) NULL AFTER filename;")
                except Exception:
                    pass
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS video_zones (
                  id BIGINT AUTO_INCREMENT PRIMARY KEY,
                  video_id BIGINT NOT NULL,
                  zone_id VARCHAR(64) NOT NULL,
                  label VARCHAR(255) NOT NULL,
                  topleft_x DOUBLE NOT NULL,
                  topleft_y DOUBLE NOT NULL,
                  topright_x DOUBLE NOT NULL,
                  topright_y DOUBLE NOT NULL,
                  bottomleft_x DOUBLE NOT NULL,
                  bottomleft_y DOUBLE NOT NULL,
                  bottomright_x DOUBLE NOT NULL,
                  bottomright_y DOUBLE NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  INDEX (video_id),
                  INDEX (zone_id),
                  CONSTRAINT fk_vzones_video FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS zone_counts (
                  id BIGINT AUTO_INCREMENT PRIMARY KEY,
                  video_id BIGINT NOT NULL,
                  zone_id VARCHAR(64) NOT NULL,
                  ts DOUBLE NOT NULL,
                  label VARCHAR(255) NOT NULL,
                  current INT NOT NULL,
                  peak INT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  INDEX (video_id),
                  INDEX (zone_id),
                  INDEX (ts),
                  CONSTRAINT fk_zcounts_video FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """
            )

ensure_tables()

@app.route('/')
def index():
    zones = []
    if os.path.exists(ZONES_FILE):
        try:
            with open(ZONES_FILE, 'r') as f:
                zones = json.load(f)
        except:
            zones = []
    file = request.args.get('file', '')
    return render_template('index.html', zones=json.dumps(zones), file=file, user=session.get('username'))

# Require login for non-public routes
@app.before_request
def require_login():
    public_endpoints = {'login', 'register', 'static'}
    # On some Flask versions, endpoint could be None for 404/static
    ep = request.endpoint or ''
    if ep.startswith('static'):
        return
    if ep in public_endpoints:
        return
    if not session.get('user_id'):
        return redirect(url_for('login'))

@app.route('/upload', methods=['POST'])
def upload():
    f = request.files.get('video')
    if not f:
        return 'No file', 400
    filename = str(int(time.time())) + '_' + secure_filename(f.filename)
    path = os.path.join(UPLOAD_FOLDER, filename)
    f.save(path)
    # Also store metadata and bytes in MySQL if available
    try:
        conn = get_db_connection()
        if conn:
            with open(path, 'rb') as rf:
                data_bytes = rf.read()
            size_bytes = os.path.getsize(path)
            with conn:
                with conn.cursor() as cur:
                    try:
                        cur.execute(
                            """
                            INSERT INTO videos (user_id, filename, file_path, original_name, mime_type, size_bytes, data)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                session.get('user_id'),
                                filename,
                                path,
                                f.filename,
                                getattr(f, 'mimetype', None),
                                size_bytes,
                                data_bytes,
                            ),
                        )
                    except Exception:
                        # Fallback if file_path column doesn't exist
                        try:
                            cur.execute(
                                """
                                INSERT INTO videos (user_id, filename, original_name, mime_type, size_bytes, data)
                                VALUES (%s, %s, %s, %s, %s, %s)
                                """,
                                (
                                    session.get('user_id'),
                                    filename,
                                    f.filename,
                                    getattr(f, 'mimetype', None),
                                    size_bytes,
                                    data_bytes,
                                ),
                            )
                        except Exception:
                            pass
    except Exception:
        # Do not break existing flow if DB fails
        pass
    return redirect(url_for('index', file=filename))

from werkzeug.utils import secure_filename

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, as_attachment=False)

@app.route('/save_zones', methods=['POST'])
def save_zones():
    data = request.get_json() or {}
    zones = data.get('zones', [])
    filename = data.get('file') or ''
    # keep existing behavior
    with open(ZONES_FILE, 'w') as f:
        json.dump(zones, f, indent=2)
    # also persist zones per video in DB if available
    inserted = 0
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'ok': True, 'inserted': inserted})
        with conn:
            with conn.cursor() as cur:
                vid = None
                if filename:
                    cur.execute("SELECT id FROM videos WHERE filename=%s AND (user_id=%s OR %s IS NULL)", (filename, session.get('user_id'), session.get('user_id')))
                    row = cur.fetchone()
                    if row: vid = row['id']
                # Fallback: if not matched by filename, use most recent video for this user
                if not vid and session.get('user_id'):
                    cur.execute("SELECT id FROM videos WHERE user_id=%s ORDER BY id DESC LIMIT 1", (session['user_id'],))
                    row = cur.fetchone()
                    if row: vid = row['id']
                if not vid:
                    return jsonify({'ok': True, 'inserted': inserted})
                # replace existing zones for this video
                cur.execute("DELETE FROM video_zones WHERE video_id=%s", (vid,))
                for z in zones:
                    cur.execute(
                        """
                        INSERT INTO video_zones (
                          video_id, zone_id, label,
                          topleft_x, topleft_y, topright_x, topright_y,
                          bottomleft_x, bottomleft_y, bottomright_x, bottomright_y
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """,
                        (
                          vid, z.get('id',''), z.get('label','Zone'),
                          float(z.get('topleft',{}).get('x',0)), float(z.get('topleft',{}).get('y',0)),
                          float(z.get('topright',{}).get('x',0)), float(z.get('topright',{}).get('y',0)),
                          float(z.get('bottomleft',{}).get('x',0)), float(z.get('bottomleft',{}).get('y',0)),
                          float(z.get('bottomright',{}).get('x',0)), float(z.get('bottomright',{}).get('y',0)),
                        )
                    )
                    inserted += 1
    except Exception:
        pass
    return jsonify({'ok': True, 'inserted': inserted})

@app.route('/log_counts', methods=['POST'])
def log_counts():
    data = request.get_json() or {}
    ts = time.time()
    rows = []
    total_current = 0
    total_peak = 0
    if isinstance(data, dict):
        for zone_id, d in data.get('counts', data if isinstance(data, dict) else {}).items():
            rows.append([ts, zone_id, d.get('label',''), int(d.get('current',0)), int(d.get('peak',0))])
            try:
                total_current += int(d.get('current',0))
                total_peak += int(d.get('peak',0))
            except Exception:
                pass
    write_header = not os.path.exists(COUNTS_CSV)
    with open(COUNTS_CSV, 'a', newline='') as csvfile:
        writer = csv.writer(csvfile)
        if write_header:
            writer.writerow(['ts','zone_id','label','current','peak'])
        writer.writerows(rows)
    # also persist to DB per video
    try:
        filename = data.get('file') if isinstance(data, dict) else None
        if filename:
            conn = get_db_connection()
            if conn:
                with conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT id FROM videos WHERE filename=%s AND (user_id=%s OR %s IS NULL)", (filename, session.get('user_id'), session.get('user_id')))
                        v = cur.fetchone()
                        if v:
                            vid = v['id']
                            for zone_id, d in (data.get('counts') or {}).items():
                                cur.execute(
                                    """
                                    INSERT INTO zone_counts (video_id, zone_id, ts, label, current, peak)
                                    VALUES (%s,%s,%s,%s,%s,%s)
                                    """,
                                    (vid, zone_id, ts, d.get('label',''), int(d.get('current',0)), int(d.get('peak',0)))
                                )
    except Exception:
        pass
    return jsonify({'ok': True, 'total_current': total_current, 'total_peak': total_peak})

@app.route('/download_zones')
def download_zones():
    if os.path.exists(ZONES_FILE):
        return send_file(ZONES_FILE, as_attachment=True)
    return 'no zones', 404

@app.route('/download_counts')
def download_counts():
    if os.path.exists(COUNTS_CSV):
        return send_file(COUNTS_CSV, as_attachment=True)
    return 'no counts', 404

# -------- Authentication --------
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = (request.form.get('username') or '').strip()
        password = request.form.get('password') or ''
        if not username or not password:
            flash('Username and password are required')
            return redirect(url_for('register'))
        conn = get_db_connection()
        if not conn:
            flash('Database not configured')
            return redirect(url_for('register'))
        with conn:
            with conn.cursor() as cur:
                try:
                    # Store plaintext password as requested
                    cur.execute(
                        "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
                        (username, password)
                    )
                except Exception:
                    flash('Username already exists')
                    return redirect(url_for('register'))
        flash('Registration successful. Please login.')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = (request.form.get('username') or '').strip()
        password = request.form.get('password') or ''
        conn = get_db_connection()
        if not conn:
            flash('Database not configured')
            return redirect(url_for('login'))
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, username, password_hash FROM users WHERE username=%s", (username,))
                row = cur.fetchone()
                if not row or row['password_hash'] != password:
                    flash('Invalid credentials')
                    return redirect(url_for('login'))
                session['user_id'] = row['id']
                session['username'] = row['username']
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    return redirect(url_for('index'))

@app.route('/my_uploads')
def my_uploads():
    if not session.get('user_id'):
        return redirect(url_for('login'))
    conn = get_db_connection()
    videos = []
    if conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, filename, original_name, size_bytes, created_at FROM videos WHERE user_id=%s ORDER BY id DESC",
                    (session['user_id'],)
                )
                videos = cur.fetchall() or []
    return render_template('my_uploads.html', videos=videos)

@app.route('/video_db/<int:vid>')
def video_db(vid: int):
    conn = get_db_connection()
    if not conn:
        return 'db not configured', 503
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT data, mime_type, original_name FROM videos WHERE id=%s", (vid,))
            row = cur.fetchone()
            if not row or not row.get('data'):
                return 'not found', 404
            from flask import Response
            resp = Response(row['data'], mimetype=row.get('mime_type') or 'application/octet-stream')
            resp.headers['Content-Disposition'] = f"inline; filename=\"{row.get('original_name') or 'video'}\""
            return resp

if __name__ == '__main__':
    app.run(debug=True, port=5000)
