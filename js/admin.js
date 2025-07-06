import { addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let _db;
let _auth;
let _appId;
let _currentUserId;
let _serverTimestamp;
let _Papa;
let _showConfirmModal;
let _collection;
let _query;
let _where;
let _addDoc;
let _getDocs;
let _doc;
let _updateDoc;
let _deleteDoc;

let definitionCounter = 0;
let termsCollectionRef;

const COLUMN_MAPPINGS = {
    'term_indicators': ['term', 'concept', 'word', 'name'],
    'note_indicators': ['note', 'description', 'summary', 'notes'],
    'definition_indicators': ['definition', 'meaning', 'def', 'deff', 'explanation'],
    'tag_indicators': ['tags', 'keywords', 'categories', 'tag', 'tabs']
};

export function initAdmin(db, auth, appId, currentUserId, serverTimestamp, Papa, showConfirmModal, collectionFn, queryFn, whereFn, addDocFn, getDocsFn, docFn, updateDocFn, deleteDocFn) {
    _db = db;
    _auth = auth;
    _appId = appId;
    _currentUserId = currentUserId;
    _serverTimestamp = serverTimestamp;
    _Papa = Papa;
    _showConfirmModal = showConfirmModal;
    _collection = collectionFn;
    _query = queryFn;
    _where = whereFn;
    _addDoc = addDocFn;
    _getDocs = getDocsFn;
    _doc = docFn;
    _updateDoc = updateDocFn;
    _deleteDoc = deleteDocFn;

    termsCollectionRef = _collection(_db, `artifacts/${_appId}/public/data/terms`);

    console.log("Admin module initialized. App ID:", _appId);

    const addDefinitionBtn = document.getElementById('add-definition-btn');
    const termForm = document.getElementById('term-form');
    const saveTermBtn = document.getElementById('save-term-btn');
    const refreshTermsBtn = document.getElementById('refresh-terms-btn');
    const csvFileInput = document.getElementById('csv-file-input');
    const importCsvBtn = document.getElementById('import-csv-btn');
    const clearDatabaseBtn = document.getElementById('clear-database-btn');

    if (!addDefinitionBtn || !termForm || !saveTermBtn || !refreshTermsBtn || !csvFileInput || !importCsvBtn || !clearDatabaseBtn) {
        console.error("Missing DOM elements for Admin panel. Check index.html.");
        return;
    }

    addDefinitionBtn.addEventListener('click', addDefinitionBlock);
    termForm.addEventListener('submit', handleSaveTerm);
    refreshTermsBtn.addEventListener('click', displayTermsMatrix);
    importCsvBtn.addEventListener('click', handleImportCsv);
    clearDatabaseBtn.addEventListener('click', handleClearDatabase);

    addDefinitionBlock();
    saveTermBtn.disabled = !(_auth && _auth.currentUser && _auth.currentUser.uid);
    displayTermsMatrix();
}

async function displayTermsMatrix() {
    const termsMatrixBody = document.getElementById('terms-matrix-body');
    if (!termsMatrixBody) {
        console.error("Error: terms-matrix-body element not found!");
        return;
    }

    termsMatrixBody.innerHTML = '<tr><td colspan="3" class="text-center py-4">Loading terms...</td></tr>';

    try {
        if (!_getDocs || !_db) {
            throw new Error("Firestore not initialized properly.");
        }
        const snapshot = await _getDocs(termsCollectionRef);
        if (snapshot.empty) {
            termsMatrixBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-400">No terms found in the database.</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const termData = doc.data();
            html += `
                <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-600">
                    <th scope="row" class="py-3 px-6 font-medium text-white whitespace-nowrap">${termData.term}</th>
                    <td class="py-3 px-6 text-center">${termData.indexDefs || 0}</td>
                    <td class="py-3 px-6 text-center">${termData.indexTags || 0}</td>
                </tr>
            `;
        });
        termsMatrixBody.innerHTML = html;
    } catch (error) {
        console.error("Error fetching terms:", error.message, error.code || '');
        termsMatrixBody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-red-400">Error loading terms: ${error.message} (${error.code || 'unknown'})</td></tr>`;
    }
}

function addDefinitionBlock() {
    definitionCounter++;
    const definitionsContainer = document.getElementById('definitions-container');
    if (!definitionsContainer) return;

    const block = document.createElement('div');
    block.className = 'definition-block bg-gray-700 p-4 rounded-lg border border-gray-600';
    block.innerHTML = `
        <label class="block text-sm font-medium text-gray-300 mb-1">Definition ${definitionCounter}</label>
        <textarea required class="definition-text w-full bg-gray-600 border border-gray-500 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" rows="3" placeholder="Explain the term..."></textarea>
        <label class="block text-sm font-medium text-gray-300 mt-2 mb-1">Tags (comma-separated, e.g., color:red, type:process, origin:manual)</label>
        <input type="text" class="definition-tags w-full bg-gray-600 border border-gray-500 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500" placeholder="e.g., biology:core, color:green">
    `;
    definitionsContainer.appendChild(block);
}

async function handleSaveTerm(event) {
    event.preventDefault();

    const saveTermBtn = document.getElementById('save-term-btn');
    const saveBtnText = document.getElementById('save-btn-text');
    const saveSpinner = document.getElementById('save-spinner');
    const statusMessage = document.getElementById('status-message');

    saveTermBtn.disabled = true;
    saveBtnText.textContent = 'Saving...';
    saveSpinner.classList.remove('hidden');
    statusMessage.textContent = '';
    statusMessage.classList.remove('text-red-500', 'text-green-500');
    statusMessage.classList.add('text-yellow-400');

    try {
        const termInput = document.getElementById('term');
        const noteInput = document.getElementById('note');
        const definitionTexts = document.querySelectorAll('.definition-text');
        const definitionTags = document.querySelectorAll('.definition-tags');

        const termName = termInput ? termInput.value.trim() : '';
        const note = noteInput ? noteInput.value.trim() : '';

        if (!termName) {
            throw new Error('Term name is required.');
        }
        if (definitionTexts.length === 0 || Array.from(definitionTexts).every(input => !input.value.trim())) {
            throw new Error('At least one definition is required.');
        }

        const incomingDefinitions = [];
        definitionTexts.forEach((textInput, index) => {
            const definitionText = textInput.value.trim();
            const tagsInput = definitionTags[index] ? definitionTags[index].value.trim() : '';
            const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== '');

            if (definitionText) {
                incomingDefinitions.push({
                    text: definitionText,
                    tags: tagsArray,
                    origin: 'manual',
                    createdAt: new Date().toISOString(),
                    modified: new Date().toISOString()
                });
            }
        });

        if (incomingDefinitions.length === 0) {
            throw new Error('No valid definitions found.');
        }

        const q = _query(termsCollectionRef, _where('term', '==', termName));
        const querySnapshot = await _getDocs(q);

        let termId = null;
        let existingTermData = null;

        if (!querySnapshot.empty) {
            termId = querySnapshot.docs[0].id;
            existingTermData = querySnapshot.docs[0].data();
        }

        let definitionsToSave = existingTermData ? [...existingTermData.definitions] : [];
        let definitionsAddedCount = 0;
        let definitionsUpdatedCount = 0;

        incomingDefinitions.forEach(newDef => {
            const existingDefIndex = definitionsToSave.findIndex(def => def.text === newDef.text);

            if (existingDefIndex !== -1) {
                const existingDef = definitionsToSave[existingDefIndex];
                const mergedTags = Array.from(new Set([...(existingDef.tags || []), ...newDef.tags]));
                if (existingDef.tags.length !== mergedTags.length || !existingDef.tags.every(tag => mergedTags.includes(tag))) {
                    definitionsToSave[existingDefIndex] = {
                        ...existingDef,
                        tags: mergedTags,
                        modified: new Date().toISOString()
                    };
                    definitionsUpdatedCount++;
                }
            } else {
                definitionsToSave.push({
                    ...newDef,
                    createdAt: new Date().toISOString(),
                    modified: new Date().toISOString()
                });
                definitionsAddedCount++;
            }
        });

        const totalIndexDefs = definitionsToSave.length;
        const allUniqueTags = new Set();
        definitionsToSave.forEach(def => {
            if (def.tags) {
                def.tags.forEach(tag => allUniqueTags.add(tag));
            }
        });
        const totalIndexTags = allUniqueTags.size;

        const termDataToSave = {
            term: termName,
            note: note,
            indexDefs: totalIndexDefs,
            indexTags: totalIndexTags,
            definitions: definitionsToSave,
            updatedAt: _serverTimestamp(),
            ...(termId ? {} : { createdBy: _currentUserId, createdAt: _serverTimestamp() })
        };

        if (termId) {
            await _updateDoc(_doc(_db, `artifacts/${_appId}/public/data/terms`, termId), termDataToSave);
            statusMessage.textContent = `Term "${termName}" updated successfully! Added ${definitionsAddedCount} new definitions, updated ${definitionsUpdatedCount} definitions.`;
        } else {
            await _addDoc(termsCollectionRef, termDataToSave);
            statusMessage.textContent = `Term "${termName}" added successfully!`;
        }

        statusMessage.classList.replace('text-yellow-400', 'text-green-500');
        termInput.value = '';
        if (noteInput) noteInput.value = '';
        document.getElementById('definitions-container').innerHTML = '';
        definitionCounter = 0;
        addDefinitionBlock();
        displayTermsMatrix();
    } catch (error) {
        console.error("Error saving term:", error.message, error.code || '');
        statusMessage.textContent = `Error saving term: ${error.message} (${error.code || 'unknown'})`;
        statusMessage.classList.replace('text-yellow-400', 'text-red-500');
    } finally {
        saveTermBtn.disabled = false;
        saveBtnText.textContent = 'Save Term';
        saveSpinner.classList.add('hidden');
    }
}

function rehashCsvRow(rowValues, headers) {
    const rehashedRow = {
        term: '',
        note: '',
        definitionTexts: [],
        allTags: new Set()
    };
    let termFound = false;
    let definitionFound = false;

    headers.forEach((header, index) => {
        const lowerHeader = String(header || '').toLowerCase();
        const value = String(rowValues[index] || '').trim();

        if (!termFound && COLUMN_MAPPINGS.term_indicators.some(indicator => lowerHeader === indicator)) {
            rehashedRow.term = value;
            if (value !== '') termFound = true;
        } else if (COLUMN_MAPPINGS.note_indicators.some(indicator => lowerHeader === indicator)) {
            rehashedRow.note = value;
        } else if (COLUMN_MAPPINGS.definition_indicators.some(indicator => lowerHeader.includes(indicator))) {
            if (value !== '') {
                rehashedRow.definitionTexts.push(value);
                definitionFound = true;
            }
        } else if (COLUMN_MAPPINGS.tag_indicators.some(indicator => lowerHeader.includes(indicator))) {
            if (value !== '') {
                value.split(',').forEach(tag => {
                    const trimmedTag = tag.trim();
                    if (trimmedTag) {
                        rehashedRow.allTags.add(trimmedTag);
                    }
                });
            }
        }
    });

    if (!termFound || rehashedRow.term === '' || !definitionFound || rehashedRow.definitionTexts.length === 0) {
        return null;
    }

    rehashedRow.allTags = Array.from(rehashedRow.allTags);
    return rehashedRow;
}

async function processCsvFile(file, fileName, importStatusMessage, csvFileInputElement) {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        importStatusMessage.textContent = 'Error: CSV file is too large (max 5MB).';
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
        return;
    }

    if (!file.name.endsWith('.csv')) {
        importStatusMessage.textContent = 'Error: Please select a .csv file.';
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
        return;
    }

    importStatusMessage.textContent = `Importing "${fileName}"... (Parsing)`;
    importStatusMessage.classList.remove('text-red-500', 'text-green-500');
    importStatusMessage.classList.add('text-yellow-400');

    try {
        const rawParsedData = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('CSV parsing timed out after 10 seconds.')), 10000);
            _Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: function(results) {
                    clearTimeout(timeout);
                    if (results.errors.length) {
                        reject(new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join('; ')}`));
                    } else {
                        resolve(results.data);
                    }
                },
                error: function(err) {
                    clearTimeout(timeout);
                    reject(err);
                }
            });
        });

        if (!rawParsedData || rawParsedData.length < 2) {
            importStatusMessage.textContent = 'CSV file is empty or missing headers/data.';
            importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        const actualHeaders = rawParsedData[0];
        const dataRows = rawParsedData.slice(1);
        const rehashedAndValidatedData = [];
        let rowsSkippedDueToRehash = 0;

        dataRows.forEach((rowValues, index) => {
            const rehashedRow = rehashCsvRow(rowValues, actualHeaders);
            if (rehashedRow) {
                rehashedAndValidatedData.push(rehashedRow);
            } else {
                rowsSkippedDueToRehash++;
            }
        });

        if (rehashedAndValidatedData.length === 0) {
            importStatusMessage.textContent = `No valid terms found in the CSV file. ${rowsSkippedDueToRehash} rows skipped.`;
            importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
            return;
        }

        const termsToProcess = {};
        rehashedAndValidatedData.forEach(row => {
            const termName = row.term;
            if (!termsToProcess[termName]) {
                termsToProcess[termName] = {
                    term: termName,
                    note: row.note,
                    definitions: []
                };
            }
            row.definitionTexts.forEach(defText => {
                termsToProcess[termName].definitions.push({
                    text: defText,
                    tags: row.allTags,
                    origin: fileName,
                    createdAt: new Date().toISOString(),
                    modified: new Date().toISOString()
                });
            });
        });

        let termsAdded = 0;
        let termsUpdated = 0;
        let definitionsSkipped = 0;
        let definitionsAdded = 0;
        let definitionsUpdated = 0;
        let totalTermsInCsv = Object.keys(termsToProcess).length;
        let termsProcessedCount = 0;

        for (const termName in termsToProcess) {
            termsProcessedCount++;
            importStatusMessage.textContent = `Processing term ${termsProcessedCount} of ${totalTermsInCsv}: "${termName}"...`;
            const incomingTermData = termsToProcess[termName];

            const q = _query(termsCollectionRef, _where('term', '==', termName));
            const querySnapshot = await _getDocs(q);

            let termDocId = null;
            let existingTermFirestoreData = null;

            if (!querySnapshot.empty) {
                termDocId = querySnapshot.docs[0].id;
                existingTermFirestoreData = querySnapshot.docs[0].data();
            }

            let definitionsForFirestore = existingTermFirestoreData ? [...(existingTermFirestoreData.definitions || [])] : [];
            let termWasUpdated = false;

            incomingTermData.definitions.forEach(newDef => {
                const existingDefIndex = definitionsForFirestore.findIndex(def => def.text === newDef.text);

                if (existingDefIndex !== -1) {
                    const existingDef = definitionsForFirestore[existingDefIndex];
                    const mergedTags = Array.from(new Set([...(existingDef.tags || []), ...newDef.tags]));
                    if (existingDef.tags.length !== mergedTags.length || !existingDef.tags.every(tag => mergedTags.includes(tag))) {
                        definitionsForFirestore[existingDefIndex] = {
                            ...existingDef,
                            tags: mergedTags,
                            modified: new Date().toISOString()
                        };
                        definitionsUpdated++;
                        termWasUpdated = true;
                    } else {
                        definitionsSkipped++;
                    }
                } else {
                    definitionsForFirestore.push(newDef);
                    definitionsAdded++;
                    termWasUpdated = true;
                }
            });

            const newIndexDefs = definitionsForFirestore.length;
            const allUniqueTagsForTerm = new Set();
            definitionsForFirestore.forEach(def => {
                if (def.tags) {
                    def.tags.forEach(tag => allUniqueTagsForTerm.add(tag));
                }
            });
            const newIndexTags = allUniqueTagsForTerm.size;

            const dataToSave = {
                term: incomingTermData.term,
                note: incomingTermData.note,
                indexDefs: newIndexDefs,
                indexTags: newIndexTags,
                definitions: definitionsForFirestore,
                updatedAt: _serverTimestamp()
            };

            if (termDocId) {
                await _updateDoc(_doc(_db, `artifacts/${_appId}/public/data/terms`, termDocId), dataToSave);
                if (termWasUpdated) {
                    termsUpdated++;
                }
            } else {
                dataToSave.createdBy = _currentUserId;
                dataToSave.createdAt = _serverTimestamp();
                await _addDoc(termsCollectionRef, dataToSave);
                termsAdded++;
            }
        }

        importStatusMessage.textContent = `Import complete: ${termsAdded} terms added, ${termsUpdated} terms updated. ${definitionsAdded} new definitions added, ${definitionsUpdated} existing definitions updated, ${definitionsSkipped} definitions skipped. ${rowsSkippedDueToRehash} rows skipped due to rehash issues.`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
        displayTermsMatrix();
        if (csvFileInputElement) {
            csvFileInputElement.value = '';
        }
    } catch (error) {
        console.error("Error importing CSV:", error.message, error.code || '');
        importStatusMessage.textContent = `Error importing CSV: ${error.message} (${error.code || 'unknown'})`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
    }
}

async function handleImportCsv() {
    const csvFileInput = document.getElementById('csv-file-input');
    const importStatusMessage = document.getElementById('import-status-message');
    if (!csvFileInput || !csvFileInput.files.length) {
        importStatusMessage.textContent = 'Please select a CSV file.';
        importStatusMessage.classList.remove('text-yellow-400', 'text-green-500');
        importStatusMessage.classList.add('text-red-500');
        return;
    }
    const file = csvFileInput.files[0];
    await processCsvFile(file, file.name, importStatusMessage, csvFileInput);
}

async function handleClearDatabase() {
    const clearDatabaseBtn = document.getElementById('clear-database-btn');
    clearDatabaseBtn.disabled = true;
    const importStatusMessage = document.getElementById('import-status-message');

    const isConfirmed = await _showConfirmModal(
        "Confirm Database Clear",
        "This action will permanently delete ALL terms from the database. Are you absolutely sure?"
    );

    if (!isConfirmed) {
        importStatusMessage.textContent = 'Database clear cancelled.';
        importStatusMessage.classList.remove('text-red-500', 'text-green-500');
        importStatusMessage.classList.add('text-yellow-400');
        clearDatabaseBtn.disabled = false;
        return;
    }

    importStatusMessage.textContent = 'Clearing database...';
    importStatusMessage.classList.remove('text-red-500', 'text-green-500');
    importStatusMessage.classList.add('text-yellow-400');

    try {
        const snapshot = await _getDocs(termsCollectionRef);
        if (snapshot.empty) {
            importStatusMessage.textContent = 'Database is already empty.';
            importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
            return;
        }

        const deletePromises = [];
        snapshot.forEach(docItem => {
            deletePromises.push(_deleteDoc(_doc(termsCollectionRef, docItem.id)));
        });

        await Promise.all(deletePromises);
        importStatusMessage.textContent = `Successfully cleared ${snapshot.size} terms from the database.`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-green-500');
        displayTermsMatrix();
    } catch (error) {
        console.error("Error clearing database:", error.message, error.code || '');
        importStatusMessage.textContent = `Error clearing database: ${error.message} (${error.code || 'unknown'})`;
        importStatusMessage.classList.replace('text-yellow-400', 'text-red-500');
    } finally {
        clearDatabaseBtn.disabled = false;
    }
}
