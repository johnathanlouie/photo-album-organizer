const angular = require('angular');
import QueryServerService from './query-server.service.js';
import { ModelDescription } from '../lib/evaluation.js';


class Options {

    #isLoaded = false;

    /** @type {Array.<string>} */
    architectures = [];

    /** @type {Array.<string>} */
    datasets = [];

    /** @type {Array.<string>} */
    losses = [];

    /** @type {Array.<string>} */
    optimizers = [];

    /** @type {Array.<string>} */
    clusters = [];

    #$rootScope;
    #queryServer;

    static $inject = ['$rootScope', 'queryServer'];

    /**
     * 
     * @param {angular.IRootScopeService} $rootScope 
     * @param {QueryServerService} queryServer 
     */
    constructor($rootScope, queryServer) {
        this.#$rootScope = $rootScope;
        this.#queryServer = queryServer;
    }

    clear() {
        this.#isLoaded = false;
        this.architectures = [];
        this.datasets = [];
        this.losses = [];
        this.optimizers = [];
        this.clusters = [];
    }

    /**
     * Fetches compile options for the deep learning model
     * @param {boolean} reload Forces a refresh
     */
    async load(reload) {
        if (!this.#isLoaded || reload) {
            this.clear();
            var response = await this.#queryServer.options();
            this.architectures = response.architectures;
            this.datasets = response.datasets;
            this.losses = response.losses;
            this.optimizers = response.optimizers;
            this.clusters = response.clusters;
            this.#isLoaded = true;
        }
    }

    *models() {
        for (let a of this.architectures) {
            for (let d of this.datasets) {
                for (let l of this.losses) {
                    for (let o of this.optimizers) {
                        yield Object.assign(new ModelDescription(), {
                            architecture: a,
                            dataset: d,
                            loss: l,
                            optimizer: o,
                            metrics: 'acc',
                            epochs: 0,
                            patience: 3,
                            split: 0,
                        });
                    }
                }
            }
        }
    }

    modelCount() {
        return this.architectures.length *
            this.datasets.length *
            this.losses.length *
            this.optimizers.length;
    }

    get isLoaded() { return this.#isLoaded; }

}

export default Options;