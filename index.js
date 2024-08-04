// Based on Unreal Engine Mod Installer library
// https://github.com/Pickysaurus/vortex-unreal-engine-library/blob/master/example/game-example/index.js
// https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Creating-a-game-extension
// https://github.com/TanninOne/extension-add-game

// Import some assets from Vortex we'll need.
const path = require('path');
const { actions, fs, util } = require('vortex-api');
const template = require('string-template');

// Basic Game Information
const GAME_ID = 'readyornot'; //Nexus Mods ID (the part of the URL before "mods")
const GAME_NAME = 'Ready Or Not';
const GAME_SHORTNAME = 'RoN';
const GAME_ARTWORK = 'gameart.jpg';
const GAME_CODE_NAME = 'ReadyOrNot';
const GAME_PLATFORM_NAME = 'Win64';

// Steam Application ID, you can get this from https://steamdb.info/apps/
const STEAMAPP_ID = '1144200';
const GAMESTORES = [STEAMAPP_ID];

// Exec
const EXE_PATH = `${GAME_CODE_NAME}.exe`;
const EXEC_PATH = `${GAME_CODE_NAME}\\Binaries\\${GAME_PLATFORM_NAME}`;
const SHIPPING_EXE_PATH = `${EXEC_PATH}\\${GAME_CODE_NAME}-${GAME_PLATFORM_NAME}-Shipping.exe`;

// Binaries
const BINARIES_ID = `${GAME_ID}-binaries`;

// Config
const CONFIG_ID = `${GAME_ID}-config`;
const CONFIG_PATH = `${GAME_CODE_NAME}\\Saved\\Config\\Windows`;
const CONFIG_EXT = ".ini";
const CONFIG_FILES = ["engine.ini", "scalability.ini"];

// Root
const ROOT_ID = `${GAME_ID}-root`;
const ROOT_FILE = GAME_CODE_NAME;

// Save
const SAVE_ID = `${GAME_ID}-save`;
const SAVE_PATH = path.join(GAME_CODE_NAME, 'Saved', 'SaveGames');
const SAVE_EXT = ".sav";

// Fallback
const FALLBACK_ID = `${GAME_ID}-fallback`;

/*
  Unreal Engine Game Data
  - modsPath: this is where the mod files need to be installed, relative to the game install folder.
  - fileExt(optional): if for some reason the game uses something other than PAK files, add the extensions here.
  - loadOrder: do we want to show the load order tab?
*/
const UNREALDATA = {
    modsPath: path.join(GAME_CODE_NAME, 'Content', 'Paks', '~mods'),
    fileExt: '.pak',
    loadOrder: true,
}

function main(context) {

    context.requireExtension('Unreal Engine Mod Installer');

    // Game data
    const game = {
        id: GAME_ID,
        name: GAME_NAME,
        mergeMods: true,
        queryPath: findGame,
        requiresCleanup: true,
        supportedTools: [],
        queryModPath: () => '.',
        compatible: {
            unrealEngine: true
        },
        logo: GAME_ARTWORK,
        executable: () => EXE_PATH,
        requiredFiles: [
            EXE_PATH,
            SHIPPING_EXE_PATH,
        ],
        setup: prepareForModding,
        environment: {
            SteamAPPId: STEAMAPP_ID
        },
        details: {
            unrealEngine: UNREALDATA,
            steamAppId: STEAMAPP_ID,
            customOpenModsPath: UNREALDATA.absModsPath || UNREALDATA.modsPath
        },
        modTypes: [
            {
                id: BINARIES_ID,
                name: "Binaries",
                priority: "high",
                targetPath: `{gamePath}\\${EXEC_PATH}`
            },
            {
                id: CONFIG_ID,
                name: "Config (LocalAppData)",
                priority: "high",
                targetPath: `{localAppData}\\${CONFIG_PATH}`
            },
            {
                id: SAVE_ID,
                name: "Save Game",
                priority: "high",
                targetPath: `{localAppData}\\${SAVE_PATH}`
            },
            {
                id: ROOT_ID,
                name: "Root Game Folder",
                priority: "high",
                targetPath: "{gamePath}"
            }
        ]
    }

    // Register game
    context.registerGame(game);

    // Register mod types
    const modTypes = util.getSafe(game, ['modTypes'], []);
    modTypes.forEach((type, idx) => {
        context.registerModType(type.id, modTypePriority(type.priority) + idx, (gameId) => {
            var _a;
            return (gameId === GAME_ID)
                && !!((_a = context.api.getState().settings.gameMode.discovered[gameId]) === null || _a === void 0 ? void 0 : _a.path);
        }, (game) => pathPattern(context.api, game, type.targetPath), () => Promise.resolve(false), { name: type.name });
    });

    // Register mod installers
    context.registerInstaller(`${ROOT_ID}`, 35, testRoot, installRoot);
    context.registerInstaller(`${CONFIG_ID}`, 45, testConfig, installConfig);
    context.registerInstaller(`${SAVE_ID}`, 55, testSave, installSave);
    context.registerInstaller(`${FALLBACK_ID}`, 65, testFallback, installFallback);

    // Register load order page if available (TODO: Rework to registerLoadOrder)
    if (UNREALDATA.loadOrder === true) {
        let previousLO;
        context.registerLoadOrderPage({
            gameId: GAME_ID,
            gameArtURL: path.join(__dirname, GAME_ARTWORK),
            preSort: (items, direction) => preSort(context.api, items, direction),
            filter: mods => mods.filter(mod => mod.type === 'ue4-sortable-modtype'),
            displayCheckboxes: false,
            callback: (loadOrder) => {
                if (previousLO === undefined) previousLO = loadOrder;
                if (loadOrder === previousLO) return;
                context.api.store.dispatch(actions.setDeploymentNecessary(GAME_ID, true));
                previousLO = loadOrder;
            },
            createInfoPanel: () =>
                context.api.translate(`Drag and drop the mods on the left to change the order in which they load. {{gameName}} loads mods in alphanumerical order, so Vortex prefixes `
                    + 'the folder names with "AAA, AAB, AAC, ..." to ensure they load in the order you set here. '
                    + 'The number in the left column represents the overwrite order. The changes from mods with higher numbers will take priority over other mods which make similar edits.',
                    { replace: { gameName: GAME_SHORTNAME } }),
        });
    }
}

function findGame() {
    return util.GameStoreHelper.findByAppId(GAMESTORES)
        .then(game => game.gamePath);
}

async function prepareForModding(discovery) {
    await fs.ensureDirWritableAsync(path.join(process.env['LOCALAPPDATA'], CONFIG_PATH));
    await fs.ensureDirWritableAsync(path.join(process.env['LOCALAPPDATA'], SAVE_PATH));
    return fs.ensureDirWritableAsync(path.join(discovery.path, UNREALDATA.modsPath));
}

async function preSort(api, items, direction) {
    const mods = util.getSafe(api.store.getState(), ['persistent', 'mods', GAME_ID], {});
    const fileExt = UNREALDATA.fileExt;

    const loadOrder = items.map(mod => {
        const modInfo = mods[mod.id];
        let name = modInfo ? modInfo.attributes.customFileName ?? modInfo.attributes.logicalFileName ?? modInfo.attributes.name : mod.name;
        const paks = util.getSafe(modInfo.attributes, ['unrealModFiles'], []);
        if (paks.length > 1) name = name + ` (${paks.length} ${fileExt} files)`;

        return {
            id: mod.id,
            name,
            imgUrl: util.getSafe(modInfo, ['attributes', 'pictureUrl'], path.join(__dirname, GAME_ARTWORK))
        }
    });

    return (direction === 'descending') ? Promise.resolve(loadOrder.reverse()) : Promise.resolve(loadOrder);
}

/*
 * mod types can be registered at arbitrary priority, a lower number means
 * the mod type will be considered first.
 * While you can use arbitrary values, most mod types are specific to a game
 * so you don't really have to care about them.
 * Mod types supporting multiple games (things like enbs for example) will use
 * a priority around 50 so what's relevant here is only whether your mod type
 * should take precedence over those or not
 */
function modTypePriority(priority) {
    return {
        high: 25,
        low: 75,
    }[priority];
}

/*
 * non-default mod types deploy mods into a different directory from the default.
 * Please consider that many folders (including the Documents directory or the
 * installation directory for the game) may be customized by users of your extension
 * so you shouldn't use concrete paths for those but placeholders that get
 * replaced on the users system at runtime.
 */
function pathPattern(api, game, pattern) {
    var _a;
    return template(pattern, {
        gamePath: (_a = api.getState().settings.gameMode.discovered[game.id]) === null || _a === void 0 ? void 0 : _a.path,
        documents: util.getVortexPath('documents'),
        localAppData: process.env['LOCALAPPDATA'],
        appData: util.getVortexPath('appData'),
    });
}

//Test for config files
function testConfig(files, gameId) {
    // Make sure we're able to support this mod
    const isConfig = files.some(file => CONFIG_FILES.includes(path.basename(file).toLocaleLowerCase()));
    const isIni = files.find(file => path.extname(file).toLowerCase() === CONFIG_EXT) !== undefined;
    let supported = (gameId === GAME_ID) && isConfig && isIni;

    // Test for a mod installer
    if (supported && files.find(file =>
        (path.basename(file).toLowerCase() === 'moduleconfig.xml') &&
        (path.basename(path.dirname(file)).toLowerCase() === 'fomod'))) {
        supported = false;
    }

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Install config files
function installConfig(files) {
    // The config files are expected to always be positioned in the mods directory we're going to disregard anything placed outside the root.
    const modFile = files.find(file => path.extname(file).toLowerCase() === CONFIG_EXT);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);
    const setModTypeInstruction = { type: 'setmodtype', value: CONFIG_ID };

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file =>
    ((file.indexOf(rootPath) !== -1) &&
        (!file.endsWith(path.sep))));

    const instructions = filtered.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file.substr(idx)),
        };
    });
    instructions.push(setModTypeInstruction);
    return Promise.resolve({ instructions });
}

//Installer test for Fluffy Mod Manager files
function testRoot(files, gameId) {
    const isMod = files.some(file => path.basename(file) === ROOT_FILE);
    let supported = (gameId === GAME_ID) && isMod;

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Installer install Fluffy Mod Manger files
function installRoot(files) {
    const modFile = files.find(file => path.basename(file) === ROOT_FILE);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);
    const setModTypeInstruction = { type: 'setmodtype', value: ROOT_ID };

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file =>
        ((file.indexOf(rootPath) !== -1))
    );

    const instructions = filtered.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file.substr(idx)),
        };
    });
    instructions.push(setModTypeInstruction);

    return Promise.resolve({ instructions });
}

//Test for save files
function testSave(files, gameId) {
    // Make sure we're able to support this mod
    const isMod = files.find(file => path.extname(file).toLowerCase() === SAVE_EXT) !== undefined;
    let supported = (gameId === GAME_ID) && isMod;

    // Test for a mod installer
    if (supported && files.find(file =>
        (path.basename(file).toLowerCase() === 'moduleconfig.xml') &&
        (path.basename(path.dirname(file)).toLowerCase() === 'fomod'))) {
        supported = false;
    }

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Install save files
function installSave(files) {
    // The config files are expected to always be positioned in the mods directory we're going to disregard anything placed outside the root.
    const modFile = files.find(file => path.extname(file).toLowerCase() === SAVE_EXT);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);
    const setModTypeInstruction = { type: 'setmodtype', value: SAVE_ID };

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file =>
    ((file.indexOf(rootPath) !== -1) &&
        (!file.endsWith(path.sep)))
    );

    const instructions = filtered.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file.substr(idx)),
        };
    });
    instructions.push(setModTypeInstruction);
    return Promise.resolve({ instructions });
}

function testFallback(files, gameId) {
    let supported = (gameId === GAME_ID);

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

function installFallback(files) {
    const setModTypeInstruction = { type: 'setmodtype', value: BINARIES_ID };

    // Remove empty directories
    const filtered = files.filter(file =>
        (!file.endsWith(path.sep))
    );

    const instructions = filtered.map(file => {
        return {
            type: 'copy',
            source: file,
            destination: path.join(file),
        };
    });
    instructions.push(setModTypeInstruction);
    return Promise.resolve({ instructions });
}

module.exports = {
    default: main,
};
