const STORAGE_KEYS = {
  CLOSET: "clueless_closet_v1",
  GENERATED_LIST: "clueless_generated_list_v1",
  GENERATED_INDEX: "clueless_generated_index_v1",
  SAVED_OUTFITS: "clueless_saved_outfits_v1"
};

const generateBtn = document.getElementById('generateBtn');
const tryAgainBtn = document.getElementById('tryAgainBtn');
const saveOutfitBtn = document.getElementById('saveOutfitBtn');
const outfitPreview = document.getElementById('outfitPreview');
const outfitExplanation = document.getElementById('outfitExplanation');

function loadCloset() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CLOSET) || '{"top":[],"bottom":[],"shoes":[],"accessory":[]}');
}

function scoreCombo(top, bottom, shoes){
  // minimal scoring just for functionality
  return 1;
}

function generateAllCombos(){
  const closet = loadCloset();
  const combos = [];
  if(!closet.top.length || !closet.bottom.length || !closet.shoes.length) return combos;
  for(let t of closet.top) for(let b of closet.bottom) for(let s of closet.shoes){
    combos.push({top:t,bottom:b,shoes:s,score:scoreCombo(t,b,s)});
  }
  return combos.sort((a,b)=>b.score - a.score);
}

function showComboAtIndex(i){
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST)||"[]");
  if(!list.length) return;
  const combo = list[i];
  outfitPreview.innerHTML = "";
  outfitExplanation.innerHTML = "";
  ['top','bottom','shoes'].forEach(key=>{
    const img = document.createElement('img');
    img.src = combo[key].src;
    outfitPreview.appendChild(img);
  });
}

generateBtn.addEventListener('click',()=>{
  const combos = generateAllCombos();
  if(!combos.length){ alert("Upload at least one top, bottom, and shoes first."); return; }
  localStorage.setItem(STORAGE_KEYS.GENERATED_LIST, JSON.stringify(combos));
  localStorage.setItem(STORAGE_KEYS.GENERATED_INDEX, "0");
  showComboAtIndex(0);
});

tryAgainBtn.addEventListener('click',()=>{
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST)||"[]");
  if(!list.length){ alert("Generate an outfit first."); return; }
  let idx = parseInt(localStorage.getItem(STORAGE_KEYS.GENERATED_INDEX) || "0");
  idx = (idx + 1) % list.length;
  localStorage.setItem(STORAGE_KEYS.GENERATED_INDEX, String(idx));
  showComboAtIndex(idx);
});

saveOutfitBtn.addEventListener('click',()=>{
  const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED_LIST)||"[]");
  if(!list.length){ alert("Generate an outfit first."); return; }
  const idx = parseInt(localStorage.getItem(STORAGE_KEYS.GENERATED_INDEX)||"0");
  const chosen = list[idx];
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_OUTFITS)||"[]");
  saved.push(chosen);
  localStorage.setItem(STORAGE_KEYS.SAVED_OUTFITS, JSON.stringify(saved));
  alert("Outfit saved!");
});
