# Petit serveur local pour tester Natx Royale sans cache navigateur.
# POST /capture?nom=xxx (corps = image en dataURL) -> enregistre .claude/captures/xxx.png (pour les tests)
import http.server, sys, os, base64, re, urllib.parse

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CAPTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'captures')

class SansCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != '/capture':
            self.send_error(404)
            return
        nom = urllib.parse.parse_qs(url.query).get('nom', ['capture'])[0]
        nom = re.sub(r'[^a-zA-Z0-9_-]', '', nom)[:40] or 'capture'
        corps = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('ascii', 'ignore')
        donnees = base64.b64decode(corps.split(',', 1)[-1])
        os.makedirs(CAPTURES, exist_ok=True)
        with open(os.path.join(CAPTURES, nom + '.png'), 'wb') as f:
            f.write(donnees)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
os.chdir(RACINE)
http.server.ThreadingHTTPServer(('127.0.0.1', port), SansCache).serve_forever()
