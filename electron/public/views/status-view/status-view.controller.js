const angular = require('angular');
const _ = require('lodash');
const mongodb = require('mongodb');
import QueryServerService from '../../services/query-server.service.js';
import ModalService from '../../services/modal.service.js';
import OptionsService from '../../services/options.service.js';
import MongoDbService from '../../services/mongodb.service.js';


class Model {

    /** @type {string} */
    architecture;

    /** @type {string} */
    dataset;

    /** @type {string} */
    loss;

    /** @type {string} */
    optimizer;

    /** @type {string} */
    metrics;

    /** @type {number} */
    epochs;

    /** @type {number} */
    patience;

    /** @type {number} */
    split;

}


class Metrics {

    /** @type {number} */
    accuracy;

    /** @type {number} */
    loss;

}


class Evaluation {

    /** @type {Model} */
    model;

    /** @type {string} */
    status;

    /** @type {Metrics} */
    training;

    /** @type {Metrics} */
    validation;

    /** @type {Metrics} */
    test;

}


class Evaluations {

    arr = [];

    isLoaded = false;

    add(e) { this.arr.push(e); }

    replace(i, e) { this.arr[i] = e; }

    /**
     * @param {Model} model
     * @returns {?Object}
     */
    fetch(model) {
        for (let i of this.arr) {
            if (_.isEqual(i.model, model)) { return i; }
        }
        return null;
    }

    /**
     * 
     * @param {Model} model 
     * @returns {boolean}
     */
    contains(model) {
        return this.fetch(model) !== null;
    }

    statuses() { return _.uniq(this.arr.map(e => e.status)); }

}


class ProgressBar {

    total = 0;
    current = 0;
    #state = 'stopped';

    stop() { this.#state = 'stopped'; }
    run() { this.#state = 'running'; }
    complete() { this.#state = 'complete'; }

    percentage() {
        if (this.total === 0) { return 0; }
        return Math.round(this.current / this.total * 100);
    }

    style() { return { width: `${this.percentage()}%` }; }

    classes() {
        switch (this.#state) {
            case 'running':
                return ['progress-bar-striped', 'progress-bar-animated'];
            case 'complete':
                return ['bg-success'];
            case 'stopped':
                return ['bg-danger'];
        }
        throw new Error();
    }

}


class Controller {

    #scope;
    #queryServer;
    #modal;
    #options;
    #mongoDb;

    static #evaluations = new Evaluations();
    #quit = false;
    #search = {
        model: {
            architecture: '',
            dataset: '',
            loss: '',
            optimizer: '',
        },
        status: 'TrainingStatus.COMPLETE',
    };
    #sort = {
        phase: 'test.accuracy',
        reverse: true,
    };
    #progressBar = new ProgressBar();

    static $inject = ['$scope', 'queryServer', 'modal', 'options', 'mongoDb'];

    /**
     * @param {angular.IScope} $scope 
     * @param {QueryServerService} queryServer
     * @param {ModalService} modal
     * @param {OptionsService} options
     * @param {MongoDbService} mongoDb
     */
    constructor($scope, queryServer, modal, options, mongoDb) {
        this.#scope = $scope;
        this.#queryServer = queryServer;
        this.#modal = modal;
        this.#options = options;
        this.#mongoDb = mongoDb;

        $scope.options = options;
        $scope.search = this.#search;
        $scope.sort = this.#sort;

        $scope.progressBar = this.#progressBar;
        $scope.optionsLoaded = () => options.isLoaded;
        $scope.evaluations = Controller.#evaluations;

        $scope.retry = () => this.#retry();
        $scope.reevaluatePending = () => this.#reevaluatePending();

        this.#preInit();
    }

    $onDestroy() { this.#quit = true; }

    /**
     * @deprecated
     */
    async #evaluateAll() {
        this.#modal.showLoading('EVALUATING...');
        Controller.#evaluations.arr = await this.#queryServer.evaluateAll();
        this.#modal.hideLoading();
        this.#scope.$apply();
    }

    async #evaluate() {
        this.#progressBar.run();
        this.#progressBar.current = 0;
        this.#progressBar.total = this.#options.modelCount();
        this.#scope.$apply();
        for (let model of this.#options.models()) {
            if (this.#quit) { return; }
            if (!Controller.#evaluations.contains(model)) {
                try {
                    let result = await this.#queryServer.evaluate(model);
                    await this.#mongoDb.insertOne('evaluations', result);
                    Controller.#evaluations.add(result);
                    this.#progressBar.current++;
                    this.#scope.$apply();
                }
                catch (e) {
                    console.error(e);
                    if (e.status === -1 || e instanceof mongodb.MongoServerSelectionError) {
                        this.#progressBar.stop();
                        this.#modal.showError(e, 'ERROR: Connection', 'Disconnected from MongoDB or server');
                        this.#scope.$apply();
                        return;
                    }
                    else if (e.status === 500) {
                        // Ignore 500 errors
                    }
                    else {
                        this.#progressBar.stop();
                        this.#modal.showError(e, 'ERROR: Deep Learning', 'Error while evaluating');
                        this.#scope.$apply();
                        return;
                    }
                }
            }
            else {
                this.#progressBar.current++;
            }
        }
        this.#progressBar.complete();
        this.#scope.$apply();
    }

    async #reevaluatePending() {
        this.#progressBar.run();
        this.#progressBar.current = 0;
        this.#progressBar.total = this.#options.modelCount();
        for (let [i, e] of Controller.#evaluations.arr.entries()) {
            if (this.#quit) { return; }
            if (e.status === 'TrainingStatus.PENDING') {
                try {
                    let result = await this.#queryServer.evaluate(e.model);
                    await this.#mongoDb.findOneAndReplace('evaluations', { model: result.model }, result);
                    Controller.#evaluations.replace(i, result);
                    this.#progressBar.current++;
                    this.#scope.$apply();
                }
                catch (e) {
                    console.error(e);
                    if (e.status === -1 || e instanceof mongodb.MongoServerSelectionError) {
                        this.#progressBar.stop();
                        this.#modal.showError(e, 'ERROR: Connection', 'Disconnected from MongoDB or server');
                        this.#scope.$apply();
                        return;
                    }
                    else if (e.status === 500) {
                        // Ignore 500 errors
                    }
                    else {
                        this.#progressBar.stop();
                        this.#modal.showError(e, 'ERROR: Deep Learning', 'Error while evaluating');
                        this.#scope.$apply();
                        return;
                    }
                }
            }
            else {
                this.#progressBar.current++;
            }
        }
        this.#progressBar.complete();
        this.#scope.$apply();
    }

    async #loadOptions() {
        await this.#options.load();
    }

    async #getEvaluated() {
        if (!Controller.#evaluations.isLoaded) {
            Controller.#evaluations.arr = await this.#mongoDb.getAll('evaluations');
            Controller.#evaluations.isLoaded = true;
        }
    }

    async #preInit() {
        try {
            this.#modal.showLoading('RETRIEVING...');
            await Promise.all([this.#getEvaluated(), this.#loadOptions()]);
            this.#modal.hideLoading();
            this.#scope.$apply();
            this.#evaluate();
        }
        catch (e) {
            console.error(e);
            this.#modal.hideLoading();
            $('#staticBackdrop').modal();
        }
    }

    #retry() {
        $('#staticBackdrop').modal('hide');
        this.#preInit();
    }

}


export default Controller;
