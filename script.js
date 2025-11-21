/* --- Storage keys --- */
const STORAGE_KEYS = {
  CLOSET: "clueless_closet_v1",
  SAVED_OUTFITS: "clueless_saved_outfits_v1",
  GENERATED_LIST: "clueless_generated_list_v1",
  GENERATED_INDEX: "clueless_generated_index_v1"
};

/* --- Load / Save closet --- */
function loadCloset() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CLOSET) || JSON.stringify({
    top: [], bottom: [], shoes: [], accessory: []
  }));
}
function saveCloset(closet) {
  localStorage.setItem(STORAGE_KEYS.CLOSET, JSON.stringify(closet));
}

/* --- File to DataURL --- */
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = err => rej(err);
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
      🔥 NEW: COMPRESS IMAGES BEFORE SAVING (VERY IMPORTANT)
---------------------------------------------------------- */
async function compressImage(dataUrl, maxSize = 200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;

      // Scale down while keeping aspect ratio
      if (w > h && w > maxSize) {
        h = Math.round(h * (maxSize / w));
        w = maxSize;
      } else if (h > maxSize) {
        w = Math.round(w * (maxSize / h));
        h = maxSize;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // JPEG with 0.7 compression = super small
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });
}

/* --- Average color from image --- */
function getAverageColorFromImage(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxSide = 120;
      let w = img.width, h = img.height;
      if (w > h && w > maxSide) { h = Math.round(h * (maxSide / w)); w = maxSide; }
      if (h > w && h > maxSide) { w = Math.round(w * (maxSide / h)); h = maxSide; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
      }
      if (count === 0) { resolve({ r: 200, g: 200, b: 200, h: 0, s: 0, l: 80 }); return; }
      r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
      const hsl = rgbToHsl(r, g, b);
      resolve({ r, g, b, h: hsl.h, s: hsl.s, l: hsl.l });
    };
    img.onerror = () => resolve({ r: 200, g: 200, b: 200, h: 0, s: 0, l: 80 });
    img.src = dataUrl;
  });
}

/* --- Color helpers --- */
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hueDistance(a, b) { let d = Math.abs(a - b); if (d > 180) d = 360 - d; return d; }

/* --- Outfit scoring --- */
function scoreCombo(top, bottom, shoes) {
  const a = top.color, b_ = bottom.color, c = shoes.color;
  let score = 0;
  const isNeutral = col => col.s <= 18 || col.l <= 12 || col.l >= 88;
  if (isNeutral(a)) score += 18; if (isNeutral(b_)) score += 18; if (isNeutral(c)) score += 18;

  const hab = hueDistance(a.h, b_.h), hac = hueDistance(a.h, c.h), hbc = hueDistance(b_.h, c.h);
  if (hab <= 40 && hac <= 40 && hbc <= 40) score += 50;
  const complementary = d => Math.abs(d - 180) <= 30;
  if (complementary(hab) || complementary(hac) || complementary(hbc)) score += 45;
  if (hab <= 40) score += 18; if (hac <= 40) score += 18; if (hbc <= 40) score += 18;

  const satDiffAB = Math.abs(a.s - b_.s), satDiffAC = Math.abs(a.s - c.s), satDiffBC = Math.abs(b_.s - c.s);
  if (satDiffAB > 80) score -= 12; if (satDiffAC > 80) score -= 12; if (satDiffBC > 80) score -= 12;

  const ldab = Math.abs(a.l - b_.l), ldac = Math.abs(a.l - c.l), ldbc = Math.abs(b_.l - c.l);
  if (ldab <= 18) score += 8; if (ldac <= 18) score += 8; if (ldbc <= 18) score += 8;

  score += Math.round((a.s + b_.s + c.s) / 50);
  return score;
}

/* --- Generate all combos --- */
function generateAllCombos() {
  const closet = loadCloset();
  const tops = closet.top || [], bottoms = closet.bottom || [], shoes = closet.shoes || [];
  const combos = [];
  if (tops.length === 0 || bottoms.length === 0 || shoes.length === 0) return combos;
  for (let t of tops) for (let b of bottoms) for (let s of shoes)
    combos.push({ top: t, bottom: b, shoes: s, score: scoreCombo(t, b, s) });
  combos.sort((x, y) => y.score - x.score);
  return combos;
}

/* --- Display closet gallery --- */
function displayClosetGallery() {
  const gallery = document.getElementById('closetGallery');
  if (!gallery) return;
  const closet = loadCloset();
  gallery.innerHTML = "";
  ['top', 'bottom', 'shoes', 'accessory'].forEach(cat => {
    (closet[cat] || []).forEach((item, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'closet-item';
      const img = document.createElement('img');
      img.src = item.src;
      img.title = `${cat} #${idx+1} — color: ${rgbToHex(item.color.r,item.color.g,item.color.b)}`;
      wrapper.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-item-btn';
      delBtn.innerText = 'Delete';
      delBtn.onclick = () => {
        closet[cat].splice(idx, 1);
        saveCloset(closet);
        displayClosetGallery();
      };
      wrapper.appendChild(delBtn);

      gallery.appendChild(wrapper);
    });
  });
}

/* --- Clear closet --- */
function clearCloset() {
  if (!confirm("Are you sure you want to clear your entire closet? This cannot be undone.")) return;
  saveCloset({ top: [], bottom: [], shoes: [], accessory: [] });
  displayClosetGallery();
}

/* --- Show combo --- */
function showComboAtIndex(i) {
  const outfitPreview = document.getElementById('outfitPreview');
  const outfitExplanation = document.getElementById('outfitExplanation');
  if (!outfitPreview || !outfitExplanation) return;

  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST) || "[]");
  if (!list || i < 0 || i >= list.length) return;
  const combo = list[i];

  outfitPreview.innerHTML = "";
  [combo.top, combo.bottom, combo.shoes].forEach(item => {
    const img = document.createElement('img');
    img.src = item.src || '';
    outfitPreview.appendChild(img);
  });

  outfitExplanation.innerText = buildExplanation(combo);
}

/* --- Build explanation --- */
function buildExplanation(combo) {
  const t = combo.top.color, b_ = combo.bottom.color, s = combo.shoes.color;
  let explanation = `Score: ${combo.score}. `;
  const neutralText = (col, which) =>
    (col.s <= 18 || col.l <= 12 || col.l >= 88) ? `${which} is neutral, pairs well. ` : "";
  explanation += neutralText(t, "Top") + neutralText(b_, "Bottom") + neutralText(s, "Shoes");
  const hab = hueDistance(t.h, b_.h), hac = hueDistance(t.h, s.h), hbc = hueDistance(b_.h, s.h);
  if (hab <= 40 && hac <= 40 && hbc <= 40) explanation += "Uses analogous colors for harmony.";
  else if (Math.abs(hab - 180) <= 30 || Math.abs(hac - 180) <= 30 || Math.abs(hbc - 180) <= 30)
    explanation += "Contains complementary color pair for bold effect.";
  else explanation += "Colors matched for balanced contrast and tones.";
  return explanation;
}

/* --- Display saved outfits --- */
function displaySavedOutfits() {
  const gallery = document.getElementById('savedGallery');
  if (!gallery) return;
  gallery.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_OUTFITS) || "[]");
  if (saved.length === 0) { gallery.innerHTML = "<p>No saved outfits yet.</p>"; return; }

  saved.forEach((outfit, idx) => {
    const card = document.createElement('div');
    card.className = 'saved-card';
    [outfit.top, outfit.bottom, outfit.shoes].forEach(item => {
      const img = document.createElement('img');
      img.src = item.src || '';
      card.appendChild(img);
    });
    const del = document.createElement('button');
    del.className = 'btn';
    del.innerText = 'Delete';
    del.onclick = () => {
      saved.splice(idx, 1);
      localStorage.setItem(STORAGE_KEYS.SAVED_OUTFITS, JSON.stringify(saved));
      displaySavedOutfits();
    };
    card.appendChild(del);
    gallery.appendChild(card);
  });
}

/* --- Initialize pages --- */
window.addEventListener('DOMContentLoaded', () => {

  // Closet page
  const fileInput = document.getElementById('fileInput');
  const addBtn = document.getElementById('addBtn');
  const categorySelect = document.getElementById('categorySelect');
  const clearBtn = document.getElementById('clearBtn');

  if (clearBtn) clearBtn.addEventListener('click', clearCloset);

  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) return alert("Select at least one image.");
      const closet = loadCloset();
      const category = categorySelect.value;

      const addedCount = fileInput.files.length;

      for (let f of fileInput.files) {
        let dataUrl = await readFileAsDataURL(f);

        // 🔥 COMPRESS BEFORE SAVING
        dataUrl = await compressImage(dataUrl);

        const color = await getAverageColorFromImage(dataUrl);
        closet[category].push({ src: dataUrl, color });
      }

      saveCloset(closet);
      displayClosetGallery();
      fileInput.value = "";

      alert(`${addedCount} item(s) added to ${category}.`);
    });
  }

  displayClosetGallery();

  // Generator page
  const generateBtn = document.getElementById('generateBtn');
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  const saveOutfitBtn = document.getElementById('saveOutfitBtn');

  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const combos = generateAllCombos();
      if (!combos.length) return alert("Upload at least one top, bottom, and shoes.");
      localStorage.setItem(STORAGE_KEYS.GENERATED_LIST, JSON.stringify(combos));
      localStorage.setItem(STORAGE_KEYS.GENERATED_INDEX, "0");
      showComboAtIndex(0);
    });
  }

  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST) || "[]" );
      if (!list.length) return alert("Generate an outfit first.");
      let idx = parseInt(localStorage.getItem(STORAGE_KEYS.GENERATED_INDEX) || "0", 10);
      idx = (idx + 1) % list.length;
      localStorage.setItem(STORAGE_KEYS.GENERATED_INDEX, String(idx));
      showComboAtIndex(idx);
    });
  }

  if (saveOutfitBtn) {
    saveOutfitBtn.addEventListener('click', () => {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST) || "[]");
      if (!list.length) return alert("Generate an outfit first.");
      const idx = parseInt(localStorage.getItem(STORAGE_KEYS.GENERATED_INDEX) || "0", 10);
      const chosen = list[idx];
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_OUTFITS) || "[]");
      saved.push(chosen);
      localStorage.setItem(STORAGE_KEYS.SAVED_OUTFITS, JSON.stringify(saved));
      alert("Outfit saved!");
    });
  }

  if (document.getElementById('savedGallery')) displaySavedOutfits();
});
