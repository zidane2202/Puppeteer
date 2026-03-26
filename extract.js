const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const URL_CIBLE = 'https://app.formation-tcfcanada.com/epreuve/comprehension-ecrite/entrainement/comprehension-ecrite-test-1';
const CHEMIN_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DOSSIER_BASE = './extractions';

(async () => {
  const dossiers = {
    base: DOSSIER_BASE,
    images: path.join(DOSSIER_BASE, 'images'),
    audios: path.join(DOSSIER_BASE, 'audios'),
    textes: path.join(DOSSIER_BASE, 'textes')
  };
  Object.values(dossiers).forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  const browser = await puppeteer.launch({
    executablePath: CHEMIN_CHROME,
    headless: false,
    args: ['--no-sandbox', '--start-maximized']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // --- INTERCEPTION MÉDIA (IMAGES & AUDIOS) ---
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const resourceType = response.request().resourceType();
      
      // On cible tout ce qui vient de vercel-storage (Images et MP3)
      if (url.includes('vercel-storage.com')) {
        const buffer = await response.buffer();
        
        if (resourceType === 'image') {
          const nomImg = `contexte_${Date.now()}.png`;
          fs.writeFileSync(path.join(dossiers.images, nomImg), buffer);
          console.log(`[CAPTURE] Image sauvegardée : ${nomImg}`);
        } 
        else if (resourceType === 'media' || url.endsWith('.mp3')) {
          const nomAudio = `audio_${Date.now()}.mp3`;
          fs.writeFileSync(path.join(dossiers.audios, nomAudio), buffer);
          console.log(`[CAPTURE] Audio sauvegardé : ${nomAudio}`);
        }
      }
    } catch (e) { /* Erreur silencieuse pour les requêtes avortées */ }
  });

  try {
    console.log('Connexion au site...');
    await page.goto(URL_CIBLE, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Attente du contenu (Question, Audio, Boutons)...');
    // On attend que les boutons de réponse apparaissent pour être sûr que tout est chargé
    await page.waitForSelector('button[class*="border-gray-200"]', { timeout: 30000 });

    // --- EXTRACTION DU TEXTE ---
    const resultats = await page.evaluate(() => {
      const clean = (t) => t ? t.replace(/\s+/g, ' ').trim() : "";
      
      const data = {
        question_titre: document.querySelector('h3')?.innerText.trim() || "",
        reponses: []
      };

      // On cible les boutons de réponse
      const boutons = document.querySelectorAll('button[class*="border-gray-200"]');
      boutons.forEach(btn => {
        const lettre = btn.querySelector('div[class*="bg-gray-100"]')?.innerText.trim() || "";
        const texteReponse = btn.querySelector('span')?.innerText.trim() || "";
        if (lettre) data.reponses.push({ choix: lettre, texte: texteReponse });
      });

      return data;
    });

    // Sauvegarde des données textes
    const nomFichier = `donnees_${Date.now()}.json`;
    fs.writeFileSync(path.join(dossiers.textes, nomFichier), JSON.stringify(resultats, null, 2), 'utf-8');

    console.log('--- EXTRACTION TERMINÉE ---');
    console.log(`Question: ${resultats.question_titre}`);
    resultats.reponses.forEach(r => console.log(`${r.choix}: ${r.texte}`));
    console.log('----------------------------');
    console.log(`Vérifie le dossier "audios" pour le fichier MP3.`);

  } catch (err) {
    console.error('Erreur :', err.message);
  }

  // On laisse le navigateur ouvert pour que l'interception média se termine bien
})();