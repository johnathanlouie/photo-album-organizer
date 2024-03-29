const angular = require('angular');
import MongoDbService from './mongodb.service.js';
import { Evaluation } from '../lib/evaluation.js';


class RatingClass {

    /** @type {mongodb.ObjectID} */
    _id;

    /** @type {string} */
    image;

    /** @type {number} */
    rating;

    /** @type {string} */
    class;

    /** @type {boolean} */
    isLabeled;

}


class DatabaseService {

    mongoDb;

    static $inject = ['mongoDb'];

    /**
     * @param {MongoDbService} mongoDb 
     */
    constructor(mongoDb) {
        this.mongoDb = mongoDb;
    }

    /**
     * 
     * @param {Evaluation} evaluation 
     */
    addEvaluation(evaluation) {
        return this.mongoDb.insertOne('evaluations', evaluation);
    }

    /**
     * 
     * @param {Evaluation} evaluation 
     */
    updateEvaluation(evaluation) {
        return this.mongoDb.findOneAndReplace('evaluations', {
            'model.architecture': evaluation.model.architecture,
            'model.dataset': evaluation.model.dataset,
            'model.epochs': evaluation.model.epochs,
            'model.loss': evaluation.model.loss,
            'model.metrics': evaluation.model.metrics,
            'model.optimizer': evaluation.model.optimizer,
            'model.patience': evaluation.model.patience,
            'model.split': evaluation.model.split,
        }, evaluation);
    }

    getAllEvaluations() {
        return this.mongoDb.getAll('evaluations').then(
            evaluations => evaluations.map(i => Evaluation.from(i))
        );
    }

    /**
     * 
     * @param {Evaluation} evaluation 
     */
    deleteEvaluation(evaluation) {
        return this.mongoDb.findOneAndDelete('evaluations', { _id: evaluation._id });
    }

    /**
     * 
     * @param {string} username 
     * @returns {angular.IPromise.<Array.<RatingClass>>}
     */
    getRatingClass(username) {
        return this.mongoDb.getAll(username);
    }

}


export default DatabaseService;
