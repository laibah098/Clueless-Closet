/* --- Storage keys --- */
const STORAGE_KEYS = {
  CLOSET: "clueless_closet_v1",
  SAVED_OUTFITS: "clueless_saved_outfits_v1",
  GENERATED_LIST: "clueless_generated_list_v1",
  GENERATED_INDEX: "clueless_generated_index_v1",
  STYLE_QUIZ: "clueless_style_quiz_v1"
};

/* --- IndexedDB helpers --- */
const DB_NAME = "closetImagesDB";
const STORE_NAME = "images";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveImageToDB(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function getImageFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function blobToDataURL(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function loadImageForGenerator(id) {
  const blob = await getImageFromDB(id);
  if (!blob) return null;
  return await blobToDataURL(blob);
}

/* --- Load / Save closet --- */
async function loadCloset() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CLOSET) || JSON.stringify({
    top: [], bottom: [], shoes: [], accessory: []
  }));
}

async function saveCloset(closet) {
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

/* --- Compress images --- */
async function compressImage(dataUrl, maxSize = 200) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = Math.round(h * (maxSize / w)); w = maxSize; }
      else if (h > maxSize) { w = Math.round(w * (maxSize / h)); h = maxSize; }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });
}

/* --- Average color --- */
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
function rgbToHex(r,g,b){return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');}
function rgbToHsl(r,g,b){r/=255; g/=255; b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b); let h=0,s=0,l=(max+min)/2; if(max!==min){const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min); switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;} h=Math.round(h*60);} return {h,s:Math.round(s*100),l:Math.round(l*100)}; }
function hueDistance(a,b){let d=Math.abs(a-b);if(d>180)d=360-d;return d;}

/* --- Handle image upload --- */
async function handleImageUpload(file, type) {
  const dataUrl = await readFileAsDataURL(file);
  const compressed = await compressImage(dataUrl, 120);
  const blob = await (await fetch(compressed)).blob();
  const id = Date.now().toString();
  await saveImageToDB(id, blob);
  const color = await getAverageColorFromImage(compressed);

  const closet = await loadCloset();
  closet[type] = closet[type] || [];
  closet[type].push({ id, color });
  await saveCloset(closet);
  await displayClosetGallery();
}

/* --- Closet gallery --- */
async function displayClosetGallery() {
  const gallery = document.getElementById('closetGallery');
  if(!gallery) return;
  const closet = await loadCloset();
  gallery.innerHTML = "";
  const categories = ['top','bottom','shoes','accessory'];
  for(const cat of categories){
    const items = closet[cat]||[];
    for(let idx=0; idx<items.length; idx++){
      const item = items[idx];
      const wrapper = document.createElement('div');
      wrapper.className = 'closet-item';
      const img = document.createElement('img');
      try {
        img.src = item.id ? await loadImageForGenerator(item.id) : '';
      } catch(e){
        img.src = '';
      }
      img.title = `${cat} #${idx+1} — color: ${rgbToHex(item.color.r,item.color.g,item.color.b)}`;
      wrapper.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-item-btn';
      delBtn.innerText = 'Delete';
      delBtn.onclick = async () => {
        items.splice(idx,1);
        await saveCloset(closet);
        await displayClosetGallery();
      };
      wrapper.appendChild(delBtn);
      gallery.appendChild(wrapper);
    }
  }
}

/* --- Clear closet --- */
async function clearCloset() {
  if(!confirm("Are you sure you want to clear your entire closet? This cannot be undone.")) return;
  await saveCloset({ top: [], bottom: [], shoes: [], accessory: [] });
  await displayClosetGallery();
}

/* --- Outfit scoring --- */
function scoreCombo(top,bottom,shoes){
  const a=top.color,b_=bottom.color,c=shoes.color; let score=0;
  const isNeutral=col=>col.s<=18||col.l<=12||col.l>=88;
  if(isNeutral(a))score+=18;if(isNeutral(b_))score+=18;if(isNeutral(c))score+=18;
  const hab=hueDistance(a.h,b_.h),hac=hueDistance(a.h,c.h),hbc=hueDistance(b_.h,c.h);
  if(hab<=40&&hac<=40&&hbc<=40)score+=50;
  const complementary=d=>Math.abs(d-180)<=30;
  if(complementary(hab)||complementary(hac)||complementary(hbc))score+=45;
  if(hab<=40)score+=18;if(hac<=40)score+=18;if(hbc<=40)score+=18;
  const satDiffAB=Math.abs(a.s-b_.s),satDiffAC=Math.abs(a.s-c.s),satDiffBC=Math.abs(b_.s-c.s);
  if(satDiffAB>80)score-=12;if(satDiffAC>80)score-=12;if(satDiffBC>80)score-=12;
  const ldab=Math.abs(a.l-b_.l),ldac=Math.abs(a.l-c.l),ldbc=Math.abs(b_.l-c.l);
  if(ldab<=18)score+=8;if(ldac<=18)score+=8;if(ldbc<=18)score+=8;
  score+=Math.round((a.s+b_.s+c.s)/50);
  return score;
}

/* --- Generate combos --- */
async function generateAllCombos(){
  const closet = await loadCloset();
  const tops = closet.top || [];
  const bottoms = closet.bottom || [];
  const shoes = closet.shoes || [];
  const accessories = closet.accessory || [];

  const combos = [];

  // must have top/bottom/shoes
  if (tops.length === 0 || bottoms.length === 0 || shoes.length === 0) return combos;

  if (accessories.length === 0) {
    // generate WITHOUT accessories
    for (let t of tops)
      for (let b of bottoms)
        for (let s of shoes)
          combos.push({
            top: t,
            bottom: b,
            shoes: s,
            accessory: null,
            score: scoreCombo(t, b, s)
          });
  } else {
    // generate WITH accessories
    for (let t of tops)
      for (let b of bottoms)
        for (let s of shoes)
          for (let a of accessories)
            combos.push({
              top: t,
              bottom: b,
              shoes: s,
              accessory: a,
              score: scoreCombo(t, b, s)  // accessory does not affect score
            });
  }

  combos.sort((x, y) => y.score - x.score);
  return combos;
}


/* --- Build explanation --- */
function buildExplanation(combo){
  const t=combo.top.color,b_=combo.bottom.color,s=combo.shoes.color;
  let explanation=`Score: ${combo.score}. `;
  const neutralText=(col,which)=>(col.s<=18||col.l<=12||col.l>=88)?`${which} is neutral, pairs well. `:"";
  explanation += neutralText(t,"Top") + neutralText(b_,"Bottom") + neutralText(s,"Shoes");
  const hab=hueDistance(t.h,b_.h),hac=hueDistance(t.h,s.h),hbc=hueDistance(b_.h,s.h);
  if(hab<=40&&hac<=40&&hbc<=40) explanation+="Uses analogous colors for harmony.";
  else if(Math.abs(hab-180)<=30||Math.abs(hac-180)<=30||Math.abs(hbc-180)<=30)
    explanation+="Contains complementary color pair for bold effect.";
  else explanation+="Colors matched for balanced contrast and tones.";
  return explanation;
}

/* --- Initialize pages --- */
window.addEventListener('DOMContentLoaded', async () => {

  const fileInput = document.getElementById('fileInput');
  const addBtn = document.getElementById('addBtn');
  const categorySelect = document.getElementById('categorySelect');
  const clearBtn = document.getElementById('clearBtn');

  if(clearBtn) clearBtn.addEventListener('click', async()=>await clearCloset());
  if(addBtn) addBtn.addEventListener('click', async()=>{
    if(!fileInput.files.length) return alert("Select at least one image.");
    const category = categorySelect.value;
    for(let f of fileInput.files) await handleImageUpload(f, category);
    await displayClosetGallery();
    fileInput.value = "";
    alert(`${fileInput.files.length} item(s) added to ${category}.`);
  });

  await displayClosetGallery();

/* --- Generator --- */
const generateBtn = document.getElementById('generateBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const saveOutfitBtn = document.getElementById('saveOutfitBtn');

let generatedList = [];
let currentIndex = 0; // Track current outfit in memory

async function showComboAtIndex(i){
  const outfitPreview = document.getElementById('outfitPreview');
  const outfitExplanation = document.getElementById('outfitExplanation');
  if(!outfitPreview || !outfitExplanation) return;

  if(!generatedList.length || i < 0 || i >= generatedList.length) return;

  const combo = generatedList[i];
  outfitPreview.innerHTML = "";

  // Show top, bottom, shoes (always required)
const itemsToShow = [combo.top, combo.bottom, combo.shoes];

// Prevent duplicate accessory from appearing
if (combo.accessory) {
  itemsToShow.push(combo.accessory);
}

// Remove duplicates by ID
const uniqueItems = [];
const seen = new Set();

for (let item of itemsToShow) {
  if (!seen.has(item.id)) {
    uniqueItems.push(item);
    seen.add(item.id);
  }
}

// Render these instead
for (let item of uniqueItems) {
  const img = document.createElement('img');
  img.src = item.id ? await loadImageForGenerator(item.id) : '';
  outfitPreview.appendChild(img);
}


  // Show top, bottom, shoes (always required)
const itemsToShow = [combo.top, combo.bottom, combo.shoes];

// Prevent duplicate accessory from appearing
if (combo.accessory) {
  itemsToShow.push(combo.accessory);
}

// Remove duplicates by ID
const uniqueItems = [];
const seen = new Set();

for (let item of itemsToShow) {
  if (!seen.has(item.id)) {
    uniqueItems.push(item);
    seen.add(item.id);
  }
}

// Render ONLY unique items
for (let item of uniqueItems) {
  const img = document.createElement('img');
  img.src = item.id ? await loadImageForGenerator(item.id) : '';
  outfitPreview.appendChild(img);
}


  outfitExplanation.innerText = buildExplanation(combo);
}

// Generate button
if(generateBtn) generateBtn.addEventListener('click', async () => {
  generatedList = await generateAllCombos();
  if(!generatedList.length) return alert("Upload at least one top, bottom, and shoes.");

  currentIndex = 0;
  await showComboAtIndex(currentIndex);
  localStorage.setItem(STORAGE_KEYS.GENERATED_LIST, JSON.stringify(generatedList));
});

// Try Again button
if(tryAgainBtn) tryAgainBtn.addEventListener('click', async () => {
  if(!generatedList.length) {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST) || "[]");
    if(!stored.length) return alert("Generate an outfit first.");
    generatedList = stored;
  }

  currentIndex = (currentIndex + 1) % generatedList.length; // safely loop through
  await showComboAtIndex(currentIndex);
});

// Save Outfit button
if(saveOutfitBtn) saveOutfitBtn.addEventListener('click', async () => {
  if(!generatedList.length) return alert("Generate an outfit first.");
  
  const chosen = generatedList[currentIndex];
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_OUTFITS) || "[]");
  saved.push(chosen);
  localStorage.setItem(STORAGE_KEYS.SAVED_OUTFITS, JSON.stringify(saved));
  alert("Outfit saved!");
  await displaySavedOutfits();
});


  /* --- Display saved outfits --- */
  async function displaySavedOutfits(){
    const gallery=document.getElementById('savedGallery');
    if(!gallery)return;
    gallery.innerHTML="";
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_OUTFITS)||"[]");
    if(saved.length===0){gallery.innerHTML="<p>No saved outfits yet.</p>"; return;}
    for(let idx=0;idx<saved.length;idx++){
      const outfit=saved[idx];
      const card=document.createElement('div');
      card.className='saved-card';
      const itemsToShow = [outfit.top, outfit.bottom, outfit.shoes];

if (outfit.accessory) {
  itemsToShow.push(outfit.accessory);
}

for (let item of itemsToShow) {
  const img = document.createElement('img');
  try { img.src = item.id ? await loadImageForGenerator(item.id) : ''; }
  catch (e) { img.src = ''; }
  card.appendChild(img);
}

      const del=document.createElement('button');
      del.className='btn'; del.innerText='Delete';
      del.onclick=async()=>{
        saved.splice(idx,1);
        localStorage.setItem(STORAGE_KEYS.SAVED_OUTFITS,JSON.stringify(saved));
        await displaySavedOutfits();
      };
      card.appendChild(del);
      gallery.appendChild(card);
    }
  }

  if(document.getElementById('savedGallery')) await displaySavedOutfits();

  /* =========================== STYLE QUIZ =========================== */
  if (document.getElementById("quizStart")) { // only run on stylequiz.html
    const questions = [
      {
        text: "What’s your go-to outfit?",
        options: [
          { text: "Oversized sweater + jeans", style: "Casual" },
          { text: "Blazer + trousers", style: "Chic" },
          { text: "Pink mini skirt + crop top", style: "Girly" },
          { text: "Leather jacket + boots", style: "Edgy" }
        ]
      },
      {
        text: "Pick a color palette:",
        options: [
          { text: "Neutrals (white, beige, brown)", style: "Chic" },
          { text: "Bright colors!", style: "Girly" },
          { text: "Black + dark tones", style: "Edgy" },
          { text: "Soft pastels", style: "Girly" }
        ]
      },
      {
        text: "Your dream closet would look like:",
        options: [
          { text: "Comfortable & simple", style: "Casual" },
          { text: "Classy and organized", style: "Chic" },
          { text: "Sparkly and fun", style: "Girly" },
          { text: "Bold and unique", style: "Edgy" }
        ]
      },
      {
        text: "Favorite shoes?",
        options: [
          { text: "Sneakers", style: "Casual" },
          { text: "Heels", style: "Chic" },
          { text: "Cute flats", style: "Girly" },
          { text: "Combat boots", style: "Edgy" }
        ]
      }
    ];

    const descriptions = {
      "Casual": "You love comfort, basics, and effortless everyday looks.",
      "Chic": "Elegant, stylish, and timeless — you always look put together.",
      "Girly": "Pink, sparkles, skirts — you love soft, feminine aesthetics!",
      "Edgy": "Bold, dark, and expressive. You’re not afraid of standing out!"
    };

    let currentQ = 0;
    let score = { Casual: 0, Chic: 0, Girly: 0, Edgy: 0 };

    const startBtn = document.getElementById("startQuizBtn");
    const quizStart = document.getElementById("quizStart");
    const quizQuestions = document.getElementById("quizQuestions");
    const quizResult = document.getElementById("quizResult");
    const questionText = document.getElementById("questionText");
    const optionsDiv = document.getElementById("options");

    startBtn.addEventListener("click", () => {
      quizStart.style.display = "none";
      quizQuestions.style.display = "block";
      loadQuestion();
    });

    function loadQuestion() {
      const q = questions[currentQ];
      questionText.textContent = q.text;
      optionsDiv.innerHTML = "";
      q.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.textContent = opt.text;
        btn.onclick = () => selectOption(opt.style);
        optionsDiv.appendChild(btn);
      });
    }

    function selectOption(style) {
      score[style]++;
      currentQ++;
      if (currentQ < questions.length) loadQuestion();
      else showResult();
    }

    function showResult() {
      quizQuestions.style.display = "none";
      quizResult.style.display = "block";
      const finalStyle = Object.keys(score).reduce((a,b) => score[a] > score[b] ? a : b);
      document.getElementById("resultStyle").textContent = finalStyle;
      document.getElementById("resultDescription").textContent = descriptions[finalStyle];
      localStorage.setItem(STORAGE_KEYS.STYLE_QUIZ, JSON.stringify({ style: finalStyle, score }));
    }
  }

});
