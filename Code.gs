function doGet(e) {
  return handleRequest('GET', e);
}

function doPost(e) {
  return handleRequest('POST', e);
}

function handleRequest(method, e) {
  // Plus besoin de l'ID si le script est rattaché au tableau (Extensions > Apps Script depuis le tableau)
  // Nom de l'onglet précis où se trouve ton tableau (ex: "Tableau de Bord")
  const SHEET_NAME = 'Tableau de Bord'; 
  
  // Headers CORS pour permettre à l'application web (n'importe où) de communiquer
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadSheet) {
      throw new Error("Impossible de lier le tableau. Le script est-il bien créé depuis la feuille de calcul ?");
    }
    
    const sheet = spreadSheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error("Onglet '" + SHEET_NAME + "' introuvable. Vérifie le nom en bas de la feuille Google Sheet.");
    }

    if (method === 'GET') {
      // GET : Récupérer toutes les données 
      const vehicles = getVehiclesData(sheet);
      const globals = getGlobalSettings(sheet);
      return output.setContent(JSON.stringify({
        status: 'success',
        data: vehicles,
        globals: globals
      }));
      
    } else if (method === 'POST') {
      // POST : Mettre à jour une ou plusieurs lignes
      // Le payload doit être envoyé en string JSON : { action: "update", vehicle: { id: 2, deployed: 1, status: "Opérationnel", ...} }
      
      let payload;
      if (e.postData && e.postData.contents) {
         payload = JSON.parse(e.postData.contents);
      } else {
         payload = JSON.parse(e.parameter.data); // Fallback depending on how fetch is made
      }
      
      if (payload.action === 'update' && payload.vehicle) {
        const result = updateVehicleRow(sheet, payload.vehicle);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Véhicule mis à jour',
          updated_row: result
        }));
      } else if (payload.action === 'shift_start') {
        const result = startShift(spreadSheet, payload.data);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Service demarré',
          data: result
        }));
      } else if (payload.action === 'shift_stop') {
        const result = stopShift(spreadSheet, payload.data);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Service terminé',
          data: result
        }));
      } else if (payload.action === 'sync_globals') {
        const result = updateGlobalSettings(sheet, payload.data);
        return output.setContent(JSON.stringify({
          status: 'success',
          message: 'Parametres globaux mis a jour',
          data: result
        }));
      } else {
         throw new Error("Action ou donnees manquantes dans le POST.");
      }
    }

  } catch (error) {
    return output.setContent(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  }
}

// --- Fonctions d'extraction et de manipulation métier ---

function getVehiclesData(sheet) {
  // ADAPTER LES PLAGES EN FONCTION DE LA VRAIE STRUCTURE DU SHEET
  // On suppose que la ligne 7 contient les entêtes et les données commencent ligne 8
  const startRow = 8;
  const lastRow = sheet.getLastRow();
  
  // Si le tableau s'arrête avant la fin de la feuille, ou pour éviter les lignes vides :
  if(lastRow < startRow) return [];
  
  const numRows = lastRow - startRow + 1;
  // A to K (colonnes 1 à 11) - Adapter selon la capture
  const numColumns = 11; 
  
  const range = sheet.getRange(startRow, 1, numRows, numColumns);
  const values = range.getValues();
  
  let vehicles = [];
  
  // Indexation des colonnes (Structure mise à jour avec "En Mission" en Col E)
  // 0: Grade, 1: Categorie, 2: Type, 3: Deployés (D), 4: En Mission (E), 5: Date (F), 6: Cout (G), 7: Statut (H), 8: Detruits (I), 9: Equipage (J), 10: Event (K), 11: Remarques (L)
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const categoryName = String(row[1]).trim();
    const vehicleName = String(row[2]).trim();
    
    // Ignorer les lignes totalement vides ou les séparateurs
    if (!categoryName && !vehicleName) continue;
    
    vehicles.push({
      id: startRow + i, // L'ID est la ligne physique dans le tableur (pratique pour l'update)
      grade: row[0],
      category: categoryName,
      name: vehicleName,
      deployed: Number(row[3]) || 0,
      inMission: Number(row[4]) || 0,
      cost: Number(row[6]) || 0,
      status: String(row[7]) || "En Base",
      destroyed: Number(row[8]) || 0,
      crew: String(row[9] || ""),
      note: String(row[11] || "")
    });
  }
  
  return vehicles;
}

function updateVehicleRow(sheet, vehicleData) {
  const rowIndex = vehicleData.id;
  Logger.log("Updating row " + rowIndex + " with status: " + vehicleData.status);
  console.log("Updating row " + rowIndex + " with status: " + vehicleData.status);
  
  if(!rowIndex || rowIndex < 8) {
    throw new Error("ID (ligne) de véhicule invalide.");
  }
  
  // 1. Colonne 4 : Déployés (Total dispos)
  sheet.getRange(rowIndex, 4).setValue(vehicleData.deployed);
  
  // 2. Colonne 5 : En Mission (NOUVEAU)
  const inMission = Number(vehicleData.inMission) || 0;
  sheet.getRange(rowIndex, 5).setValue(inMission);
  
  // 3. LOGIQUE AUTOMATIQUE DU STATUT (Colonne 8 : Statut)
  let status = "En Base";
  const total = Number(vehicleData.deployed) || 0;
  
  if (total === 0) {
    status = "Pas déployé";
  } else if (inMission > 0) {
    status = "Opérationnel";
  } else {
    status = "En Base";
  }
  sheet.getRange(rowIndex, 8).setValue(status);
  
  // 4. Colonne 10 : Équipage
  sheet.getRange(rowIndex, 10).setValue(vehicleData.crew);
  
  // 5. Colonne 9 : Détruit
  if(vehicleData.destroyed !== undefined) {
      sheet.getRange(rowIndex, 9).setValue(vehicleData.destroyed);
  }
  
  Logger.log("Row " + rowIndex + " updated. Status: " + status + ", Mission: " + inMission);
  return rowIndex;
}

function startShift(ss, data) {
  const dashSheet = ss.getSheetByName('Tableau de Bord');
  const baseSheet = ss.getSheetByName('Base SL Logi');
  
  // 1. Update Dashboard (G4: pseudo, H4: start time)
  if (dashSheet) {
    dashSheet.getRange(4, 7).setValue(data.pseudo);
    dashSheet.getRange(4, 8).setValue(data.startTime);
    dashSheet.getRange(4, 9).setValue(""); // Clear end time
  }
  
  // 2. Increment Base count
  if (baseSheet && data.pseudo) {
    const values = baseSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).toLowerCase() === data.pseudo.toLowerCase()) {
        const currentVal = Number(values[i][1]) || 0;
        baseSheet.getRange(i + 1, 2).setValue(currentVal + 1);
        break;
      }
    }
  }
  return data;
}

function stopShift(ss, data) {
  const dashSheet = ss.getSheetByName('Tableau de Bord');
  const histSheet = ss.getSheetByName('Historique SL Logi');
  
  // 1. Update Dashboard (G4: "OFF", I4: end time)
  if (dashSheet) {
    dashSheet.getRange(4, 7).setValue("OFF"); // User requested "OFF"
    dashSheet.getRange(4, 9).setValue(data.endTime);
  }
  
  // 2. Append to History
  // A: Pseudo, B: Start, C: End, D: Deployed, E: Destroyed, F: Effectif
  if (histSheet) {
    histSheet.appendRow([
      data.pseudo,
      data.startTime,
      data.endTime,
      data.totalDeployed,
      data.totalDestroyed,
      data.personnel
    ]);
  }
  return data;
}

function getGlobalSettings(sheet) {
  // J6: Supply, J5: Personnel, J7: Medics, G4: SL Name
  return {
    supply: Number(sheet.getRange(6, 10).getValue()) || 12000,
    personnel: Number(sheet.getRange(5, 10).getValue()) || 0,
    medics: Number(sheet.getRange(7, 10).getValue()) || 0,
    slName: String(sheet.getRange(4, 7).getValue()) || "Non identifié"
  };
}

function updateGlobalSettings(sheet, data) {
  // J6: Supply de base, J5: Personnel, J7: Medics
  if (data.supply !== undefined) sheet.getRange(6, 10).setValue(data.supply);
  if (data.personnel !== undefined) sheet.getRange(5, 10).setValue(data.personnel);
  if (data.medics !== undefined) sheet.getRange(7, 10).setValue(data.medics);
  return data;
}

// Fonction de test depuis l'éditeur App Script
function testGet() {
  const SPREADSHEET_ID = 'A_REMPLACER'; 
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  const res = getVehiclesData(sheet);
  Logger.log(JSON.stringify(res, null, 2));
}
