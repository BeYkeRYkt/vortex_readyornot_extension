// Based on Unreal Engine Mod Installer library
// https://github.com/Pickysaurus/vortex-unreal-engine-library/blob/master/example/game-example/index.js
// https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Creating-a-game-extension
// https://github.com/TanninOne/extension-add-game
// https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Developers-General-Adding-a-load-order-page

// Import some assets from Vortex we'll need.
const path = require('path');
const { actions, fs, selectors, util } = require('vortex-api');
const template = require('string-template');

// Basic Game Information
const GAME_ID = 'readyornot'; //Nexus Mods ID (the part of the URL before "mods")
const GAME_NAME = 'Ready Or Not';
const GAME_ARTWORK = 'gameart.jpg';
const GAME_CODE_NAME = 'ReadyOrNot';
const GAME_PLATFORM_NAME = 'Win64';

// Steam Application ID, you can get this from https://steamdb.info/apps/
const STEAMAPP_ID = '1144200';
const GAMESTORES = [STEAMAPP_ID];

// Exec
const EXE_PATH = `${GAME_CODE_NAME}.exe`;
const EXEC_PATH = `${GAME_CODE_NAME}\\Binaries\\${GAME_PLATFORM_NAME}`;

// Binaries
const BINARIES_ID = `${GAME_ID}-binaries`;

// FMOD
const FMOD_ID = `${GAME_ID}-fmod`;
const FMOD_PATH = path.join(GAME_CODE_NAME, 'Content', 'FMOD', 'Desktop');
const FMOD_EXT = '.bank';

// Movies
const MOVIES_ID = `${GAME_ID}-movies`;
const MOVIES_PATH = path.join(GAME_CODE_NAME, 'Content', 'Movies');
const MOVIES_EXT = '.mp4';

// VO
const VO_ID = `${GAME_ID}-vo`;
const VO_PATH = path.join(GAME_CODE_NAME, 'Content', 'VO');
const VO_FILE = 'VO';
const VO_EXT = '.ogg';

// Config
const CONFIG_ID = `${GAME_ID}-config`;
const CONFIG_PATH = path.join(GAME_CODE_NAME, 'Saved', 'Config', 'Windows');
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

// LoadOrder
const LO_FILE_NAME = 'loadOrder.json';

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
    loadOrderPrefixFunc: toLOPrefix,
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
            EXE_PATH
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
                id: FMOD_ID,
                name: "FMOD",
                priority: "high",
                targetPath: `{gamePath}\\${FMOD_PATH}`
            },
            {
                id: MOVIES_ID,
                name: "Movies",
                priority: "high",
                targetPath: `{gamePath}\\${MOVIES_PATH}`
            },
            {
                id: VO_ID,
                name: "Voice Over (VO)",
                priority: "high",
                targetPath: `{gamePath}\\${VO_PATH}`
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
    context.registerInstaller(`${FMOD_ID}`, 45, testFmod, installFmod);
    context.registerInstaller(`${MOVIES_ID}`, 55, testMovies, installMovies);
    context.registerInstaller(`${VO_ID}`, 65, testVO, installVO);
    context.registerInstaller(`${CONFIG_ID}`, 75, testConfig, installConfig);
    context.registerInstaller(`${SAVE_ID}`, 85, testSave, installSave);
    context.registerInstaller(`${FALLBACK_ID}`, 95, testFallback, installFallback);

    // Register load order page if available
    if (UNREALDATA.loadOrder === true) {
        context.registerLoadOrder({
            gameId: GAME_ID,
            validate: async () => Promise.resolve(undefined), // no validation needed
            deserializeLoadOrder: async () => deserialize(context),
            serializeLoadOrder: async (loadOrder) => serialize(context, loadOrder),
            toggleableEntries: false,
            usageInstructions: `Drag and drop the mods on the left to change the order in which they load. RoN loads mods in alphanumerical order, so Vortex prefixes `
                + 'the folder names with "AAA, AAB, AAC, ..." to ensure they load in the order you set here. '
                + 'The number in the left column represents the overwrite order. The changes from mods with higher numbers will take priority over other mods which make similar edits.',
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

/* ======================= LOAD ORDER START ======================= */

function generateProps(context, profileId) {
    const api = context.api;
    const state = api.getState();
    const profile = (profileId !== undefined)
        ? selectors.profileById(state, profileId)
        : selectors.activeProfile(state);

    if (profile?.gameId !== GAME_ID) {
        return undefined;
    }

    const discovery = util.getSafe(state,
        ['settings', 'gameMode', 'discovered', GAME_ID], undefined);
    if (discovery?.path === undefined) {
        return undefined;
    }

    const mods = util.getSafe(state, ['persistent', 'mods', GAME_ID], {});
    return { api, state, profile, mods, discovery };
}

function makePrefix(input) {
    let res = '';
    let rest = input;
    while (rest > 0) {
        res = String.fromCharCode(65 + (rest % 25)) + res;
        rest = Math.floor(rest / 25);
    }
    return util.pad(res, 'A', 3);
}

function toLOPrefix(context, mod) {
    const props = generateProps(context);
    if (props === undefined) {
        return 'ZZZZ-';
    }

    // Retrieve the load order as stored in Vortex's application state.
    const loadOrder = util.getSafe(props.state, ['persistent', 'loadOrder', props.profile.id], []);

    // Find the mod entry in the load order state and insert the prefix in front
    //  of the mod's name/id/whatever
    const index = loadOrder.findIndex((loEntry) => loEntry.id === mod.id);
    if (index === -1) {
        return 'ZZZZ-';
    }
    return makePrefix(index) + '-';
}

async function ensureLOFile(context, profileId, props) {
    if (props === undefined) {
        props = generateProps(context, profileId);
    }

    if (props === undefined) {
        return Promise.reject(new util.ProcessCanceled('failed to generate game props'));
    }

    const targetPath = path.join(props.discovery.path, props.profile.id + '_' + LO_FILE_NAME);
    try {
        await fs.statAsync(targetPath)
            .catch({ code: 'ENOENT' }, () => fs.writeFileAsync(targetPath, JSON.stringify([]), { encoding: 'utf8' }));
        return targetPath;
    } catch (err) {
        return Promise.reject(err);
    }
}

async function serialize(context, loadOrder) {
    const props = generateProps(context, undefined);
    if (props === undefined) {
        return Promise.reject(new util.ProcessCanceled('invalid props'));
    }

    // Make sure the LO file is created and ready to be written to.
    const loFilePath = await ensureLOFile(context, props.profile.id, props);
    const filteredLO = loadOrder.filter(lo => props.mods?.[lo?.modId]?.type == 'ue4-sortable-modtype');

    // Write the prefixed LO to file.
    await fs.removeAsync(loFilePath).catch({ code: 'ENOENT' }, () => Promise.resolve());
    await fs.writeFileAsync(loFilePath, JSON.stringify(filteredLO, null, 4), { encoding: 'utf8' });

    // something has changed so we need to tell vortex that a deployment will be necessary
    context.api.store.dispatch(actions.setDeploymentNecessary(GAME_ID, true));

    return Promise.resolve();
}

async function deserialize(context) {
    // generateProps is a small utility function which returns often re-used objects
    //  such as the current list of installed Mods, Vortex's application state,
    //  the currently active profile, etc.
    const props = generateProps(context, undefined);
    if (props?.profile?.gameId !== GAME_ID) {
        // Why are we deserializing when the profile is invalid or belongs to
        //  another game ?
        return [];
    }

    // The deserialization function should be used to filter and insert wanted data into Vortex's
    //  loadOrder application state, once that's done, Vortex will trigger a serialization event
    //  which will ensure that the data is written to the LO file.
    const currentModsState = util.getSafe(props.profile, ['modState'], {});

    // we only want to insert enabled mods.
    const enabledModIds = Object.keys(currentModsState)
        .filter(modId => util.getSafe(currentModsState, [modId, 'enabled'], false));
    const mods = util.getSafe(props.state,
        ['persistent', 'mods', GAME_ID], {});
    const loFilePath = await ensureLOFile(context, props.profile.gameId, props);
    const fileData = await fs.readFileAsync(loFilePath, { encoding: 'utf8' });
    let data = [];
    try {
        try {
            data = JSON.parse(fileData);
        } catch (err) {
            await new Promise((resolve, reject) => {
                props.api.showDialog('error', 'Corrupt load order file', {
                    bbcode: props.api.translate('The load order file is in a corrupt state. You can try to fix it yourself '
                        + 'or Vortex can regenerate the file for you, but that may result in loss of data ' +
                        '(Will only affect load order items you added manually, if any).')
                }, [
                    { label: 'Cancel', action: () => reject(err) },
                    {
                        label: 'Regenerate File', action: () => {
                            data = [];
                            return resolve();
                        }
                    }
                ])
            })
        }

        // User may have disabled/removed a mod - we need to filter out any existing
        //  entries from the data we parsed.
        const filteredData = data.filter(entry => enabledModIds.includes(entry.id));

        // Check if the user added any new mods.
        const diff = enabledModIds.filter(
            (id) =>
                ["ue4-sortable-modtype"].includes(
                    mods[id]?.type,
                ) && filteredData.find((loEntry) => loEntry.id === id) === undefined,
        );

        // Add any newly added mods to the bottom of the loadOrder.
        diff.forEach(missingEntry => {
            filteredData.push({
                id: missingEntry,
                modId: missingEntry,
                enabled: true,
                name: mods[missingEntry] !== undefined
                    ? util.renderModName(mods[missingEntry])
                    : missingEntry,
            });
        });

        // At this point you may have noticed that we're not setting the prefix
        //  for the newly added mod entries - we could certainly do that here,
        //  but that would simply be code duplication as we need to assign prefixes
        //  during serialization anyway (otherwise user drag-drop interactions will
        //  not be saved)
        return Promise.resolve(filteredData);
    } catch (err) {
        return Promise.reject(err);
    }
}

/* ======================= LOAD ORDER END ========================= */

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

//Test for fmod files
function testFmod(files, gameId) {
    // Make sure we're able to support this mod
    const isFMOD = files.find(file => path.extname(file).toLowerCase() === FMOD_EXT) !== undefined;
    let supported = (gameId === GAME_ID) && isFMOD;

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Install fmod files
function installFmod(files) {
    const modFile = files.find(file => path.extname(file).toLowerCase() === FMOD_EXT);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);
    const setModTypeInstruction = { type: 'setmodtype', value: FMOD_ID };

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

//Test for movies files
function testMovies(files, gameId) {
    // Make sure we're able to support this mod
    const isMovie = files.find(file => path.extname(file).toLowerCase() === MOVIES_EXT) !== undefined;
    let supported = (gameId === GAME_ID) && isMovie;

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Install movies files
function installMovies(files) {
    const modFile = files.find(file => path.extname(file).toLowerCase() === MOVIES_EXT);
    const idx = modFile.indexOf(path.basename(modFile));
    const rootPath = path.dirname(modFile);
    const setModTypeInstruction = { type: 'setmodtype', value: MOVIES_ID };

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

//Test for VO files
function testVO(files, gameId) {
    const isVO = files.some(file => path.basename(file) === VO_FILE);
    let supported = (gameId === GAME_ID) && isVO;

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}

//Install VO files
function installVO(files) {
    const modFile = files.find(file => path.basename(file) === VO_FILE);
    const idx = modFile.indexOf(path.basename(modFile));
    const setModTypeInstruction = { type: 'setmodtype', value: VO_ID };

    // Remove empty directories
    const filtered = files.filter(file =>
        (!file.endsWith(path.sep))
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

// DEFAULT MOD FALLBACK
// Used if a mod cannot be defined

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
