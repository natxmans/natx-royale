// Connexion entre potes avec PeerJS (WebRTC) : un joueur héberge, les autres
// tapent son code. En solo, tout passe en local sans Internet.
import { serveursRelais } from './retours.js';
const PREFIXE = 'natxroyale-v1-';

// Serveurs pour traverser les box et la 4G : STUN publics + relais (TURN) fourni par notre serveur s'il est configuré.
// (Les relais par défaut de PeerJS ne répondaient plus le 10 nov. 2026 : on ne les utilise pas.)
async function optionsPeer() {
  const relais = await serveursRelais();
  return { debug: 0, config: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...relais] } };
}

export class Reseau {
  constructor() {
    this.peer = null;
    this.conns = new Map();   // id → connexion (côté hôte)
    this.connHote = null;     // connexion vers l'hôte (côté invité)
    this.estHote = false;
    this.monId = null;
    this.code = null;
    this.surMessageHote = () => {};    // (deQui, msg) — exécuté chez l'hôte
    this.surMessageClient = () => {};  // (msg) — exécuté chez tout le monde
    this.surDepart = () => {};         // (id) — un invité est parti (chez l'hôte)
    this.surPerteHote = () => {};      // l'hôte est parti (chez l'invité)
  }

  solo() {
    this.estHote = true; this.monId = 'hote'; this.code = null;
  }

  async heberger(code) {
    this.estHote = true; this.monId = 'hote';
    const options = await optionsPeer();
    return new Promise((ok, ko) => {
      if (!window.Peer) { ko(new Error('PeerJS ne s\'est pas chargé (pas d\'Internet ?)')); return; }
      this.code = code;
      const peer = new window.Peer(PREFIXE + code, options);
      this.peer = peer;
      const minuteur = setTimeout(() => ko(new Error('Le serveur de connexion ne répond pas.')), 12000);
      peer.on('open', () => { clearTimeout(minuteur); ok(code); });
      peer.on('error', err => { clearTimeout(minuteur); if (!this.ouvert) ko(err); else console.warn(err); });
      peer.on('open', () => { this.ouvert = true; });
      peer.on('connection', conn => {
        conn.on('open', () => {
          this.conns.set(conn.peer, conn);
          conn.on('data', d => this.surMessageHote(conn.peer, d));
        });
        conn.on('close', () => { this.conns.delete(conn.peer); this.surDepart(conn.peer); });
        conn.on('error', () => { this.conns.delete(conn.peer); this.surDepart(conn.peer); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* rien */ } });
    });
  }

  async rejoindre(code) {
    this.estHote = false;
    const options = await optionsPeer();
    return new Promise((ok, ko) => {
      if (!window.Peer) { ko(new Error('PeerJS ne s\'est pas chargé (pas d\'Internet ?)')); return; }
      const peer = new window.Peer(options);
      this.peer = peer;
      let signal = false; // le serveur de connexion a répondu : le code est bon, c'est le lien direct qui coince
      const minuteur = setTimeout(() => ko(new Error(signal
        ? `La partie ${code} existe, mais la connexion avec l'hôte ne passe pas. C'est fréquent en 4G : essaie en Wi-Fi.`
        : 'Le serveur de connexion ne répond pas. Vérifie ta connexion Internet.')), 20000);
      peer.on('error', err => {
        clearTimeout(minuteur);
        if (err.type === 'peer-unavailable') ko(new Error('Aucune partie avec le code ' + code + '.'));
        else ko(err);
      });
      peer.on('open', id => {
        this.monId = id;
        signal = true;
        const conn = peer.connect(PREFIXE + code, { reliable: true, serialization: 'json' });
        this.connHote = conn;
        conn.on('open', () => { clearTimeout(minuteur); this.code = code; ok(id); });
        conn.on('data', d => this.surMessageClient(d));
        conn.on('close', () => this.surPerteHote());
      });
    });
  }

  // Invité → hôte (ou directement en local si on est l'hôte)
  versHote(msg) {
    if (this.estHote) { queueMicrotask(() => this.surMessageHote(this.monId, msg)); return; }
    if (this.connHote && this.connHote.open) this.connHote.send(msg);
  }

  // Hôte → tout le monde (lui compris)
  diffuser(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
    queueMicrotask(() => this.surMessageClient(msg));
  }

  // Hôte → un seul joueur
  envoyerA(id, msg) {
    if (id === this.monId) { queueMicrotask(() => this.surMessageClient(msg)); return; }
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }

  // Hôte : met un joueur à la porte
  exclure(id) {
    const c = this.conns.get(id);
    if (!c) return;
    try { c.send({ t: 'exclu' }); } catch (e) { /* rien */ }
    this.conns.delete(id);
    setTimeout(() => { try { c.close(); } catch (e) { /* rien */ } }, 300);
  }

  fermer() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* rien */ }
    this.peer = null; this.conns.clear(); this.connHote = null; this.ouvert = false;
  }
}
