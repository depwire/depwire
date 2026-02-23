from flask import Flask, jsonify

app = Flask(__name__)

API_PORT = 8000
DEBUG_MODE = True

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/api/data')
def get_data():
    return jsonify({"data": []})

if __name__ == '__main__':
    app.run(port=API_PORT, debug=DEBUG_MODE)
