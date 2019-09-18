import {RUNNING_TESTS} from "@walletpack/core/util/TestingHelper";
import * as Actions from '@walletpack/core/store/constants';
const Store = window.require('electron-store');
const {Wallet} = window.require('electron').remote.getGlobal('appShared');

const ABIS_NAME = 'abi';
const HISTORIES_NAME = 'histories';
const TRANSLATION_NAME = 'translation';
const SCATTER_DATA_NAME = 'scatter';
const SCATTER_INTERMED_NAME = 'scatter_intermed';

const stores = {};
const getStore = name => {
	if(!stores.hasOwnProperty(name))
		stores[name] = new Store({name});

	return stores[name];
};

const scatterStorage = () => getStore(SCATTER_DATA_NAME);
const historyStorage = () => getStore(HISTORIES_NAME);
const translationStorage = () => getStore(TRANSLATION_NAME);
const scatterIntermedStorage = () => getStore(SCATTER_INTERMED_NAME);
const abiStorage = () => getStore(ABIS_NAME);

import {ipcAsync, ipcFaF, remote} from '../../util/ElectronHelpers';
import {AES} from "aes-oop";
import {HISTORY_TYPES} from "@walletpack/core/models/histories/History";
import HistoricTransfer from "@walletpack/core/models/histories/HistoricTransfer";
import HistoricExchange from "@walletpack/core/models/histories/HistoricExchange";
import HistoricAction from "@walletpack/core/models/histories/HistoricAction";
import Seeder from "@walletpack/core/services/secure/Seeder";
import ElectronHelpers from "../../util/ElectronHelpers";
import * as FileService from "./FileService";
const fs = window.require('fs');

const setSavingData = (bool) => remote.getGlobal('appShared').savingData = bool;


let saveResolvers = [];
let saveTimeouts = [];
const clearSaveTimeouts = () => {
	saveResolvers.map(x => x(true));
	saveTimeouts.map(x => clearTimeout(x));
	saveTimeouts = [];
};

const safeSetScatter = async (scatter, resolver) => {
	setSavingData(true);

	if(RUNNING_TESTS){
		await scatterStorage().set('scatter', scatter);
		setSavingData(false);
		return resolver(true);
	}

	const path = name => `${remote.app.getPath('userData')}/${name}.json`;
	const retry = () => saveTimeouts.push(
		setTimeout(() => safeSetScatter(scatter, resolver), 50)
	);

	const salt = await StorageService.getSalt();
	await scatterIntermedStorage().set('scatter', scatter);
	await scatterIntermedStorage().set('salt', salt);
	const savedScatter = await scatterIntermedStorage().get('scatter');

	// Didn't save properly
	if(scatter !== savedScatter) retry();

	// Saved properly, overwriting old data with new data
	else fs.rename(path(SCATTER_INTERMED_NAME), path(SCATTER_DATA_NAME), (err) => {
		if(err) return retry();
		resolver(true);
		setSavingData(false);
	});
};

const isPopup = location.hash.indexOf('popout') > -1;

export default class StorageService {

	constructor(){}

	static getDefaultPath(){
		return ElectronHelpers.getDefaultPath()
	};

	static saveFile(...params){
		return FileService.saveFile(...params);
	};

	static async setScatter(scatter){
		if(isPopup) return;
		return new Promise(async resolve => {
			clearSaveTimeouts();
			saveResolvers.push(resolve);
			safeSetScatter(scatter, resolve);
		})
	};

	static getScatter() {
		return scatterStorage().get('scatter');
	}

	static removeScatter(){
		if(isPopup) return;
		scatterStorage().clear();
		abiStorage().clear();
		historyStorage().clear();
		translationStorage().clear();
		Wallet.setScatter(null);
		// TODO: Clear main process
		return true;
	}

	static cacheABI(contractName, chainId, abi){
		return abiStorage().set(`abis.${contractName}_${chainId}`, abi);
	}

	static getCachedABI(contractName, chainId){
		return abiStorage().get(`abis.${contractName}_${chainId}`);
	}

	static getSalt(){
		return scatterStorage().get('salt') || 'SALT_ME';
	}

	static setSalt(salt){
		return scatterStorage().set('salt', salt);
	}

	static async getTranslation(){
		let translation = translationStorage().get('translation');
		if(!translation) return null;
		return AES.decrypt(translation, await Seeder.getSeed());
	}

	static async setTranslation(translation){
		const encrypted = AES.encrypt(translation, await Seeder.getSeed());
		return translationStorage().set('translation', encrypted);
	}

	static async getHistory(){
		let history = historyStorage().get('history');
		if(!history) return [];
		history = AES.decrypt(history, await Seeder.getSeed());

		history = history.map(x => {
			if(x.type === HISTORY_TYPES.Transfer) return HistoricTransfer.fromJson(x);
			if(x.type === HISTORY_TYPES.Exchange) return HistoricExchange.fromJson(x);
			if(x.type === HISTORY_TYPES.Action) return HistoricAction.fromJson(x);
			return null;
		}).filter(x => x);

		return history;
	}

	static async updateHistory(x){
		let history = await this.getHistory();
		if(history.find(h => h.id === x.id)) history = history.filter(h => h.id !== x.id);
		history.unshift(x);
		const encrypted = AES.encrypt(history, await Seeder.getSeed());
		return historyStorage().set('history', encrypted);
	}

	static async deltaHistory(x){
		let history = await this.getHistory();
		if(x === null) history = [];
		else {
			if(history.find(h => h.id === x.id)) history = history.filter(h => h.id !== x.id);
			else history.unshift(x);
		}

		const encrypted = AES.encrypt(history, await Seeder.getSeed());
		return historyStorage().set('history', encrypted);
	}

	static async swapHistory(history){
		const encrypted = AES.encrypt(history, await Seeder.getSeed());
		return historyStorage().set('history', encrypted);
	}


	static async setLocalScatter(scatter){
		window.localStorage.setItem('scatter', scatter);
		return true;
	}

	static getLocalScatter(){
		return window.localStorage.getItem('scatter');
	}
}