import { dedupeCaseInsensitive, findClosestLocale, isObject } from './all'
//scope: webextension background.js
// REextension.*** instead of extension.***
// collection requirements:
// global `nub.stg = {}`
// _locales/[LOCALE_TAG]/ directories
// all.js - findClosestLocale
// messages.json in _locales/** directories

// REQUIREMENTS:
// all.js - dedupeCaseInsensitive
export async function getUserPreferredLocales() {
  // returns an array with the locales of the user. first entry is most highly preferred. after that is less
  let userlocale_preferred = extension.i18n.getUILanguage(); // same as `extension.i18n.getMessage('@@ui_locale')`
  let userlocale_lesspreferred = await extension.i18n.getAcceptLanguages();

  let userlocales = [userlocale_preferred, ...userlocale_lesspreferred];

  // remove duplicates, case insensitively
  return dedupeCaseInsensitive(userlocales);
}

// REQUIREMENTS:
// all.js - findClosestLocale
export async function getClosestAvailableLocale() {
    // gets the locale available in my extension, that is closest to the users locale
    // returns null if nothing close

    // lower case things because thats what findClosestLocale needs
    let extlocales = await getExtLocales(); // these are the available locales
    let userlocales = await getUserPreferredLocales();

    let available = extlocales;
    let wanted = userlocales.map(el => el.toLowerCase()); // findClosestLocale needs it lower case

    return findClosestLocale(available, wanted); // returns `null` if not found
}

// REQUIREMENTS:
// _locales/[LOCALE_TAG]/ directories
export async function getExtLocales() {
	let response = await (await fetch('/_locales/')).text();

    /* responses
        win10 (note there is no space after DIRECTORY)
            300: jar:file:///C:/Users/Mercurius/Documents/GitHub/Trigger/_dist1484203143189.xpi!/webextension/_locales/
            200: filename content-length last-modified file-type
            201: en-US/ 0 Thu,%2012%20Jan%202017%2006:38:52%20GMT DIRECTORY

        ubuntu 15.01 (note there is a space after DIRECTORY)
            300: file:///home/noi/Desktop/triig/webextension/_locales/
            200: filename content-length last-modified file-type
            201: en-US 0 Thu,%2012%20Jan%202017%2006:38:54%20GMT DIRECTORY
    */

    console.log('xhr of _locales dir response:', response);
	let locales = [];
	let match, patt = /201: (.*?)\/? 0.*?DIRECTORY/gm;
	while (match = patt.exec(response)) { // eslint-disable-line no-cond-assign
        console.log('match:', match);
        locales.push(match[1]);
    }

	console.log('all locales in extension:', locales);
	return locales;
}

// REQUIREMENTS
// messages.json in _locales/** directories
export async function getSelectedLocale(testkey) {
	// returns the locale in my extension, that is being used by the browser, to display my extension stuff
	// testkey - string of key common to all messages.json files - will collect this message from each of the extlocales, then see what extension.i18n.getMessage(testkey) is equal to
	// REQUIRED: pick a `testkey` that has a unique value in each message.json file
	let extlocales = await getExtLocales();

	let errors = [];
	let msgs = {}; // localized_messages `[messages.json[testkey]]: extlocale`
	for (let extlocale of extlocales) {
		let msg = (await (await fetch('/_locales/' + extlocale + '/messages.json')).json())[testkey].message;

		if (msg in msgs) errors.push(`* messages.json for locale "${extlocale}" has the same "message" as locale ${msgs[msg]} for \`testkey\`("${testkey}")`);
		else msgs[msg] = extlocale;
	}

	if (errors.length) throw 'ERROR(getSelectedLocale):\n' + errors.join('\n');

	return msgs[extension.i18n.getMessage(testkey)];
}

// rev3 - not yet comit - https://gist.github.com/Noitidart/bcb964207ac370d3301720f3d5c9eb2b
// REQUIREMENTS:
// global `nub.stg = {}`
var _storagecall_pendingset = {};
var _storagecall_callid = 1;
export function storageCall(aArea, aAction, aKeys, aOptions) {
	if (isObject(aArea)) ({ aArea, aAction, aKeys, aOptions } = aArea);
	// because storage can fail, i created this, which goes until it doesnt fail

	// aAction - string;enum[set,get,clear,remove]
	// aKeys -
		// if aAction "clear" then ignore
		// if aAction "remove" then string/string[]
		// if aAction "get" then null/string/string[]
		// if aAction "set" then object
	// aOptions - object
		// maxtries - int;default:0 - set to 0 if you want it to try infinitely
		// timebetween - int;default:50 - milliseconds
		// nub - reference to nub

	aOptions = aOptions ? aOptions : {};
	const maxtries = aOptions.maxtries || 0;
	const timebetween = aOptions.timebetween || 50;
	const nub = aOptions.nub;

	const callid = _storagecall_callid++; // the id of this call to `storageCall` // only used for when `aAction` is "set"

	if (aAction === 'set') {
		// see if still trying to set any of these keys
		for (var setkey in aKeys) {
			_storagecall_pendingset[setkey] = callid;
		}
	}
	return new Promise(function(resolve, reject) {
		// start asnc-proc49399
		var trycnt = 0;

		var call = function() {
			switch (aAction) {
				case 'clear':
						extension.storage[aArea][aAction](check);
					break;
				case 'set':
						// special processing
						// start - block-link3191
						// make sure that each this `callid` is still responsible for setting in `aKeys`
						for (var setkey in aKeys) {
							if (_storagecall_pendingset[setkey] !== callid) {
								delete aKeys[setkey];
							}
						}
						// end - block-link3191
						if (!Object.keys(aKeys).length) resolve(); // no longer responsible, as another call to set - with the keys that this callid was responsible for - has been made, so lets say it succeeded // i `resolve` and not `reject` because, say i was still responsible for one of the keys, when that completes it will `resolve`
						else extension.storage[aArea][aAction](aKeys, check);
					break;
				default:
					extension.storage[aArea][aAction](aKeys, check);
			}
		};

		var check = function(arg1) {
			if (extension.runtime.lastError) {
				if (!maxtries || trycnt++ < maxtries) setTimeout(call, timebetween);
				else reject(extension.runtime.lastError); // `maxtries` reached
			} else {
				switch (aAction) {
					case 'clear':
					case 'remove':
							// callback `check` triggred with no arguments
							resolve();
						break;
					case 'set':
							// callback `check` triggred with no arguments - BUT special processing

							// race condition I THINK - because i think setting storage internals is async - so what if another call came in and did the set while this one was in between `call` and `check`, so meaningi t was processing - and then this finished processing AFTER a new call to `storageCall('', 'set'` happend
							// copy - block-link3191
							// make sure that each this `callid` is still responsible for setting in `aKeys`
							for (let setkey in aKeys) {
								if (_storagecall_pendingset[setkey] !== callid) {
									delete aKeys[setkey];
								}
							}
							// end copy - block-link3191

							// remove keys from `_storagecall_pendingset`
							for (let setkey in aKeys) {
								// assuming _storagecall_pendingset[setkey] === callid
								delete _storagecall_pendingset[setkey];
							}

							// SPECIAL - udpate nub.stg
							if (isObject(nub) && nub.stg) {
								for (let setkey in aKeys) {
									if (setkey in nub.stg) nub.stg[setkey] = aKeys[setkey];
								}
							}

							resolve(aKeys);
						break;
					case 'get':
							// callback `check` triggred with 1 argument
							var stgeds = arg1;
							resolve(stgeds);
						break;
				}
				resolve(stgeds);
			}
		};

		call();
		// end asnc-proc49399
	});
}
