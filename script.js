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
  for(let item of [combo.top, combo.bottom, combo.shoes]){
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
