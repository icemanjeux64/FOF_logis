/**
 * CONFIGURATION DES ONGLETS
 * Assure-toi que les noms correspondent exactement à ceux de ton Google Sheet.
 */
const SHEETS = {
  DASHBOARD: 'Tableau de Bord',
  EQUIPAGES: 'Équipages',
  HISTORY: 'Historique SL Logi',
  BASE: 'Base SL Logi'
};

/**
 * Récupère les mouvements actifs (En cours)
 */
function getActiveMovements(ss) {
  const logSheet = ss.getSheetByName(SHEETS.EQUIPAGES);
  if (!logSheet) return {};

  const lastRow = logSheet.getLastRow();
  if (lastRow < 2) return {};

  const values = logSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const movements = {};

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const status = String(row[5]);
    const indicatif = String(row[2]);
    const vehicleType = String(row[1]);

    if (status === 'En cours' && indicatif) {
      if (!movements[indicatif]) {
        movements[indicatif] = {
          vehicleType: vehicleType,
          indicatif: indicatif,
          crew: String(row[3]),
          mission: String(row[4]),
          status: status,
          condition: String(row[6])
        };
      }
    }
  }
  return movements;
}

/**
 * Point d'entrée pour les requêtes GET (Lecture des données)
 */
function doGet(e) {
  return handleRequest('GET', e);
}

/**
 * Point d'entrée pour les requêtes POST (Écriture des données)
 */
function doPost(e) {
  return handleRequest('POST', e);
}

/**
 * Gestionnaire principal des requêtes
 */
function handleRequest(method, e) {
  const output = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashSheet = ss.getSheetByName(SHEETS.DASHBOARD);
    
    if (!dashSheet) throw new Error("L'onglet '" + SHEETS.DASHBOARD + "' est introuvable.");

    let payload = {};

    if (method === 'GET') {
      const vehicles = getVehiclesData(dashSheet);
      const globals = getGlobalSettings(dashSheet);
      const movements = getActiveMovements(ss);
      
      return output.setContent(JSON.stringify({
        status: 'success',
        data: vehicles,
        globals: globals,
        movements: movements
      }));
      
    } else if (method === 'POST') {
      if (!e) throw new Error("Aucun paramètre reçu. Ne pas exécuter manuellement depuis l'éditeur.");

      try {
        if (e.postData && e.postData.contents) {
          payload = JSON.parse(e.postData.contents);
        } else if (e.parameter && e.parameter.data) {
          payload = JSON.parse(e.parameter.data);
        } else {
          payload = e.parameter || {};
        }
      } catch (err) {
        throw new Error("Format JSON invalide : " + err.toString());
      }
      
      let result;

      switch (payload.action) {
        case 'update':
          if (!payload.vehicle) throw new Error("Données véhicule manquantes.");
          result = updateVehicleRow(dashSheet, payload.vehicle);
          return output.setContent(JSON.stringify({ status: 'success', message: 'Tableau mis à jour', row: result }));

        case 'log_equipage':
          if (!payload.data) throw new Error("Données de mouvement manquantes.");
          result = logMovement(ss, payload.data);
          return output.setContent(JSON.stringify({ status: 'success', message: 'Mouvement enregistré', data: result }));

        case 'shift_start':
          if (!payload.data) throw new Error("Données de session manquantes.");
          result = startShift(ss, payload.data);
          return output.setContent(JSON.stringify({ status: 'success', message: 'Service démarré', data: result }));

        case 'shift_stop':
          if (!payload.data) throw new Error("Données de session manquantes.");
          result = stopShift(ss, payload.data);
          return output.setContent(JSON.stringify({ status: 'success', message: 'Service terminé', data: result }));

        case 'sync_globals':
          const dataToSync = payload.data || payload;
          result = updateGlobalSettings(dashSheet, dataToSync);
          return output.setContent(JSON.stringify({ status: 'success', message: 'Paramètres mis à jour', data: result }));

        default:
          throw new Error("Action '" + (payload.action || "inconnue") + "' non reconnue.");
      }
    }

  } catch (error) {
    console.error("Erreur serveur : " + error.toString());
    return output.setContent(JSON.stringify({
      status: 'error',
      message: error.toString()
    }));
  }
}

/**
 * Récupère les données des véhicules (Grille à partir de la ligne 9)
 */
function getVehiclesData(sheet) {
  const startRow = 9; 
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return [];
  
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 13).getValues();
  
  return values.filter(row => row[1] || row[2]).map((row, index) => ({
    id: startRow + index,
    grade: row[0],
    category: row[1],
    name: row[2],
    deployed: Number(row[3]) || 0,
    inMission: Number(row[4]) || 0,
    cost: Number(row[6]) || 0,
    status: String(row[7]),
    destroyed: Number(row[8]) || 0,
    crew: String(row[9] || ""),
    note: String(row[12] || "")
  }));
}

/**
 * Met à jour une ligne de véhicule
 */
function updateVehicleRow(sheet, v) {
  const rowIndex = v.id;
  if (!rowIndex || rowIndex < 8) throw new Error("ID de ligne invalide.");

  sheet.getRange(rowIndex, 4).setValue(v.deployed);
  sheet.getRange(rowIndex, 5).setValue(v.inMission);
  
  let status = "En Base";
  if (Number(v.deployed) === 0) {
    status = "Pas déployé";
  } else if (Number(v.inMission) > 0) {
    status = "Opérationnel";
  }
  sheet.getRange(rowIndex, 8).setValue(status);

  if (v.destroyed !== undefined) sheet.getRange(rowIndex, 9).setValue(v.destroyed);
  if (v.crew !== undefined) sheet.getRange(rowIndex, 10).setValue(v.crew);

  return rowIndex;
}

/**
 * LOG des mouvements détaillé dans l'onglet Équipages
 */
function logMovement(ss, data) {
  let logSheet = ss.getSheetByName(SHEETS.EQUIPAGES);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEETS.EQUIPAGES);
    logSheet.appendRow(["Horodatage", "Type Véhicule", "ID/Indicatif", "Équipage", "Mission", "Statut Mission", "État Matériel", "Remarques"]);
    logSheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#f3f3f3");
  }

  logSheet.appendRow([
    new Date(),
    data.vehicleType || "Inconnu",
    data.idIndicatif || "-",
    data.crew || "Non assigné",
    data.mission || "N/A",
    data.status || "En cours",
    data.condition || "Opérationnel",
    data.remark || ""
  ]);

  return data;
}

/**
 * Démarre le service (DASHBOARD H4, I4 et Incrément base)
 */
function startShift(ss, data) {
  const dash = ss.getSheetByName(SHEETS.DASHBOARD);
  const base = ss.getSheetByName(SHEETS.BASE);
  
  if (dash) {
    dash.getRange(4, 8).setValue(data.pseudo); 
    dash.getRange(4, 9).setValue(data.startTime); 
    dash.getRange(4, 10).setValue(""); 
  }
  
  if (base && data.pseudo) {
    const values = base.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
        if (values[i][0] && String(values[i][0]).toLowerCase() === data.pseudo.toLowerCase()) {
        const count = Number(values[i][1]) || 0;
        base.getRange(i + 1, 2).setValue(count + 1);
        break;
      }
    }
  }
  return data;
}

/**
 * Termine le service (DASHBOARD J4, K4 et Historique)
 */
function stopShift(ss, data) {
  const dash = ss.getSheetByName(SHEETS.DASHBOARD);
  const hist = ss.getSheetByName(SHEETS.HISTORY);
  
  if (dash) {
    dash.getRange(4, 8).setValue("OFF");
    dash.getRange(4, 10).setValue(data.endTime);
  }
  
  if (hist) {
    hist.appendRow([
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

/**
 * Lecture des paramètres globaux (Colonne K)
 */
function getGlobalSettings(sheet) {
  let startVal = sheet.getRange(4, 9).getValue();
  let endVal = sheet.getRange(4, 10).getValue();
  
  // If it's a string from the Sheet (FR format), try to ensure it's ISO for the app
  // Apps Script often auto-converts cell dates to Date objects, but if it's a string:
  if (!(startVal instanceof Date) && startVal && String(startVal).includes('/')) {
    // Basic FR to ISO-like hint: DD/MM/YYYY -> MM/DD/YYYY for JS Date constructor (simplistic but often works in GAS)
    // Actually, GAS is powerful. Let's just try to send it as is if it's not a Date, 
    // or better, try new Date(val).
    const testDate = new Date(startVal);
    if (!isNaN(testDate.getTime())) startVal = testDate;
  }

  return {
    supply: Number(sheet.getRange(6, 11).getValue()),    // K6
    personnel: Number(sheet.getRange(5, 11).getValue()), // K5
    medics: Number(sheet.getRange(7, 11).getValue()),    // K7
    slName: String(sheet.getRange(4, 8).getValue()),     // H4
    shiftStartTime: (startVal instanceof Date) ? startVal.toISOString() : startVal,
    shiftEndTime: (endVal instanceof Date) ? endVal.toISOString() : endVal
  };
}

/**
 * Écriture des paramètres globaux (Colonne K)
 */
function updateGlobalSettings(sheet, data) {
  if (!data || typeof data !== 'object' || data === null) {
    console.error("Erreur critique : data est invalide dans updateGlobalSettings", data);
    return null;
  }

  if (data.supply !== undefined && data.supply !== null) sheet.getRange(6, 11).setValue(data.supply);
  if (data.personnel !== undefined && data.personnel !== null) sheet.getRange(5, 11).setValue(data.personnel);
  if (data.medics !== undefined && data.medics !== null) sheet.getRange(7, 11).setValue(data.medics);
  
  return data;
}