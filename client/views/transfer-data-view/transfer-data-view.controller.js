const fs = require('fs');
const os = require('os');
const mongodb = require('mongodb');
const _ = require('lodash');
const process = require('process');
const path = require('path');
const parseCsv = require('csv-parse/lib/sync');
const stringifyCsv = require('csv-stringify/lib/sync');
const angular = require('angular');
import MongoDbService from '../../services/mongodb.service.js';
import ModalService from '../../services/modal.service.js';
import UsersService from '../../services/users.service.js';
import FocusImageService from '../../services/focus-image.service.js';
import DatabaseService from '../../services/database.service.js';


class CombinedDatum {

    /** @type {mongodb.ObjectID} */
    _id;

    /** @type {string} */
    image;

    /** @type {Array.<number>} */
    rating = [];

    /** @type {Array.<string>} */
    class = [];

    /** @type {boolean} */
    isLabeled = true;

    /**
     * 
     * @param {string} image 
     */
    constructor(image) {
        this.image = image;
    }

    /** @param {Datum} datum */
    combine(datum) {
        if (this.image !== datum.image) { throw new Error(); }
        this.rating.push(datum.rating);
        this.class.push(datum.class);
    }

    averageRating() {
        return _.mean(this.rating);
    }

    /**
     * 
     * @returns {string}
     */
    mostCommonClass() {
        let max = 0;
        let maxClasses = [];
        for (let [class_, count] of _.toPairs(_.countBy(this.class))) {
            if (max === count) {
                maxClasses.push(class_);
            }
            else if (max < count) {
                max = count;
                maxClasses = [class_];
            }
        }
        return _.sample(maxClasses);
    }

    toDatum() {
        let datum = new Datum();
        datum.image = this.image;
        datum.rating = this.averageRating();
        datum.class = this.mostCommonClass();
        datum.isLabeled = true;
        return datum;
    }

}


class Datum {

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

    static fromUrl(dirname, filename) {
        let instance = new Datum();
        instance.image = path.join(dirname, filename);
        instance.isLabeled = false;
        return instance;
    }

}


class DataContainer {

    /** @type {Array.<Datum>} */
    container = [];

    /** Removes the _id property of documents so they can be inserted into MongoDB */
    removeIds() {
        for (let i of this.container) {
            delete i._id;
        }
    }

    randomRating() {
        for (let doc of this.container) {
            doc.rating = Math.round(Math.random() * 2) + 1;
        }
    }

    randomClass() {
        for (let doc of this.container) {
            doc.class = _.sample([
                'environment',
                'people',
                'object',
                'hybrid',
                'animal',
                'food',
            ]);
        }
    }

    roundRating() {
        for (let doc of this.container) {
            doc.rating = Math.round(doc.rating);
        }
    }

    get isEmpty() { return this.container.length === 0; }

}


class DataTargets {

    newData = {
        filepath: path.join(os.homedir(), 'Pictures'),
        recursive: true,
    };

    exportPath = path.join(process.cwd(), 'export.csv');

    /** @type {FileList} */
    file1;

    /** @type {string} */
    collectionPush;

    /** @type {string} */
    collectionPull;

}


class Controller {

    #data = new DataContainer();
    #dataTargets = new DataTargets();

    static $inject = ['$scope', '$q', 'mongoDb', 'modal', 'users', 'focusImage', 'database'];
    $scope;
    $q;
    mongoDb;
    modal;
    users;
    focusImage;
    database;

    /**
     * @param {angular.IScope} $scope 
     * @param {angular.IQService} $q 
     * @param {MongoDbService} mongoDb 
     * @param {ModalService} modal
     * @param {UsersService} users
     * @param {FocusImageService} focusImage
     * @param {DatabaseService} database
     */
    constructor($scope, $q, mongoDb, modal, users, focusImage, database) {
        this.$scope = $scope;
        this.$q = $q;
        this.mongoDb = mongoDb;
        this.modal = modal;
        this.users = users;
        this.focusImage = focusImage;
        this.database = database;

        $scope.users = users;
        $scope.dataTargets = this.#dataTargets;
        $scope.data = this.#data;
        $scope.load = () => this.readCsv();
        $scope.upload = () => this.writeMongoDb();
        $scope.download = () => this.readMongoDb();
        $scope.export = () => this.writeCsv();
        $scope.getImages = () => this.getImages();
        $scope.collateData = () => this.collateData();
        $scope.focusOnImage = function (url) {
            focusImage.image = url;
            modal.showPhoto();
        };

        this.getMongoCollections();
    }

    readCsv() {
        this.#data.container = [];
        if (this.#dataTargets.file1.length > 0) {
            try {
                this.#data.container = parseCsv(fs.readFileSync(this.#dataTargets.file1[0].path), {
                    columns: ['image', 'rating', 'class', 'isLabeled', '_id'],
                    cast: function (value, context) {
                        switch (context.column) {
                            case 'rating':
                                return Number(value);
                            case 'isLabeled':
                                return Boolean(value);
                            default:
                                return value;
                        }
                    },
                });
            }
            catch (e) {
                console.error(e);
                this.modal.showError(e, 'ERROR: CSV', 'Loading or parsing error');
            }
        }
    }

    writeMongoDb() {
        this.modal.showLoading('UPLOADING...');
        return this.mongoDb.insertMany(this.#data.container, this.#dataTargets.collectionPush).then(
            () => this.users.load(true)
        ).then(() => {
            if (this.users.users.length > 0) {
                this.#dataTargets.collectionPull = this.users.users[0];
            }
            else {
                this.#dataTargets.collectionPull = null;
            }
            this.modal.hideLoading();
        }).catch(e => {
            console.error(e);
            this.modal.hideLoading();
            this.modal.showError(e, 'ERROR: MongoDB', 'Error while inserting many');
        });
    }

    readMongoDb() {
        this.#data.container = [];
        this.modal.showLoading('RETRIEVING...');
        return this.mongoDb.getAll(this.#dataTargets.collectionPull).then(x => {
            this.#data.container = x;
            this.modal.hideLoading();
        }).catch(e => {
            console.error(e);
            this.modal.hideLoading();
            this.modal.showError(e, 'ERROR: MongoDB', 'Error while fetching collection');
        });
    }

    collateData() {
        this.#data.container = [];
        /** @type {Map.<string, CombinedDatum>} */
        let map = new Map();
        this.modal.showLoading('RETRIEVING...');
        return this.$q.all(this.users.users.map(
            username => this.database.getRatingClass(username).
                then(docs => {
                    for (let doc of docs) {
                        if (!map.has(doc.image)) {
                            map.set(doc.image, new CombinedDatum(doc.image));
                        }
                        map.get(doc.image).combine(doc);
                    }
                })
        )).then(() => {
            this.#data.container = Array.from(map.values()).map(combined => combined.toDatum());
            this.modal.hideLoading();
        }).catch(e => {
            console.error(e);
            this.modal.hideLoading();
            this.modal.showError(e, 'ERROR: MongoDB', 'Error while fetching collection');
        });
    }

    writeCsv() {
        fs.writeFileSync(this.#dataTargets.exportPath, stringifyCsv(this.#data.container, {
            columns: [
                { key: 'image' },
                { key: 'rating' },
                { key: 'class' },
                { key: 'isLabeled' },
                { key: '_id' },
            ],
        }));
    }

    getImages() {
        this.#data.container = [];
        let directories = [this.#dataTargets.newData.filepath];
        /** @type {Array.<Datum>} */
        for (let i = 0; i < directories.length; i++) {
            let contents = fs.readdirSync(directories[i], { withFileTypes: true });
            for (let datum of contents.filter(dirent => dirent.isFile() && ['.jpg', '.jpeg'].includes(path.extname(dirent.name).toLowerCase())).
                map(dirent => Datum.fromUrl(directories[i], dirent.name))) {
                this.#data.container.push(datum);
            }
            if (this.#dataTargets.newData.recursive) {
                for (let dirname of contents.filter(dirent => dirent.isDirectory()).
                    map(dirent => path.join(directories[i], dirent.name))) {
                    directories.push(dirname);
                }
            }
        }
    }

    /**
     * Gets the names of all the collections in MongoDB so the user can select which collection to pull from
     */
    getMongoCollections() {
        this.modal.showLoading('RETRIEVING...');
        return this.users.load(false).then(() => {
            if (this.users.users.length > 0) {
                this.#dataTargets.collectionPull = this.users.users[0];
            }
            else {
                this.#dataTargets.collectionPull = null;
            }
            this.modal.hideLoading();
        }).catch(e => {
            console.error(e);
            this.modal.hideLoading();
            this.modal.showError(e, 'ERROR: MongoDB', 'Error while fetching users');
        });
    }

}


export default Controller;
