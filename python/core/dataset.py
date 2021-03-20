import json
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, List, Optional, Tuple, Union

from jl import ListFile, npexists, npload, npsave
from keras.utils import to_categorical
from numpy import ndarray
from sklearn.model_selection import train_test_split
from typing2 import ArrayLike, Url, number


class XY(Enum):
    """
    Used in the dataset classes.
    """
    X = 'x'
    Y = 'y'


class Phase(Enum):
    """
    Used in the dataset classes.
    """
    TRAIN = 'train'
    VALIDATION = 'val'
    TEST = 'test'


class DataSetXY(object):
    """
    Stores or loads an input x or an output y array for deep learning.
    """

    def __init__(self, name: str, split: int, phase: Phase, xy: XY) -> None:
        self.name: str = name
        self.split: int = split
        self.phase: Phase = phase
        self.xy: XY = xy

    def __str__(self) -> str:
        return '%s/%d/%s.%s' % (self.name, self.split, self.phase.value, self.xy.value)

    def __add__(self, other: Any) -> str:
        return str(self) + other

    def __radd__(self, other: Any) -> str:
        return other + str(self)

    def save(self, data: ndarray, verbose: bool = True) -> None:
        """
        Saves a NumPy array as a file.
        """
        npsave(self, data, verbose)

    def load(self, verbose: bool = True) -> ndarray:
        """
        Loads a NumPy array from a file.
        """
        return npload(self, verbose)

    def exists(self) -> bool:
        """
        Returns true if the file exists.
        """
        return npexists(self)


class DataSetPhase(object):
    """
    Represents a training, test, or validation phase for deep learning.
    """

    def __init__(self, name: str, split: int, phase: Phase) -> None:
        self.name: str = name
        self.split: int = split
        self.phase: Phase = phase

    def _get_xy(self, xy: XY) -> DataSetXY:
        """
        Gets an input x or an output y from this phase.
        """
        return DataSetXY(self.name, self.split, self.phase, xy)

    def x(self) -> DataSetXY:
        """
        Gets the input x from this phase.
        """
        return self._get_xy(XY.X)

    def y(self) -> DataSetXY:
        """
        Gets the input y from this phase.
        """
        return self._get_xy(XY.Y)

    def exists(self) -> bool:
        """
        Returns true if all files exist.
        """
        if not self.x().exists():
            return False
        if not self.y().exists():
            return False
        return True


class Predictions(ABC):
    """
    An interpreter for predictions.
    """

    def __init__(self, x: ndarray, y: ndarray) -> None:
        self._x: ndarray = x
        self._y: ndarray = y

    @abstractmethod
    def human_readable(self) -> List[Any]:
        """
        Translates the return value from keras.models.Model.predict_generator.
        """
        pass

    def save_as_list(self, url: Url) -> None:
        """
        Saves to a text file in human readable format.
        """
        ListFile(url).write(self.human_readable())

    def save_json(self, url: Url) -> None:
        json.dump(self.human_readable(), open(url, 'w'))


class PredictionsFactory(ABC):
    """
    """

    @abstractmethod
    def predictions(self, x: ndarray, y: ndarray) -> Predictions:
        """
        Returns a concrete instance of Predictions.
        """
        pass


class DataSetSplitName(object):
    """
    """

    def __init__(self, dataset: str, split: int) -> None:
        self.dataset: str = dataset
        self.split: int = split


class DataSetSplit(object):
    """
    Represents a split of a dataset for cross-validation.
    """

    def __init__(self, dataset: str, split: int, predFac: PredictionsFactory) -> None:
        self._dataset: str = dataset
        self._split: int = split
        self._predFac: PredictionsFactory = predFac

    def _phase(self, phase: Phase) -> DataSetPhase:
        """
        Gets a phase from this split.
        """
        return DataSetPhase(self._dataset, self._split, phase)

    def train(self) -> DataSetPhase:
        """
        Gets the training phase from this split.
        """
        return self._phase(Phase.TRAIN)

    def test(self) -> DataSetPhase:
        """
        Gets the testing phase from this split.
        """
        return self._phase(Phase.TEST)

    def validation(self) -> DataSetPhase:
        """
        Gets the validation phase from this split.
        """
        return self._phase(Phase.VALIDATION)

    def exists(self) -> bool:
        """
        Returns true if all files exist.
        """
        if not self.train().exists():
            return False
        if not self.test().exists():
            return False
        if not self.validation().exists():
            return False
        return True

    def translate_predictions(self, x: ndarray, y: ndarray) -> Predictions:
        return self._predFac.predictions(x, y)

    def name(self) -> DataSetSplitName:
        return DataSetSplitName(self._dataset, self._split)


class DataSet(ABC):
    """
    Interface for datasets. Mainly used for hints.
    """

    @property
    @staticmethod
    @abstractmethod
    def NAME() -> str:
        pass

    @property
    @staticmethod
    @abstractmethod
    def OUTPUT_NUM() -> int:
        pass

    @abstractmethod
    def prepare(self) -> None:
        """
        Reads and convert the dataset data files into NumPy arrays for Keras.
        """
        pass

    def get_split(self, num: int) -> DataSetSplit:
        """
        Gets the training, testing, and validation split for Keras.
        """
        return DataSetSplit(self.NAME, num, self._predictions_factory())

    def train_val_test(
        self,
        xx: ArrayLike,
        yy: ArrayLike,
        test_size: number = 0.1,
        shuffle: bool = True,
    ) -> Tuple[ndarray, ndarray, ndarray, ndarray, ndarray, ndarray]:
        """
        Divides up the dataset into training, validation, and testing phases.
        """
        vali_size = 1 / self.splits()
        xx, ex, yy, ey = train_test_split(
            xx,
            yy,
            test_size=test_size,
            train_size=None,
            shuffle=shuffle,
        )
        tx, vx, ty, vy = train_test_split(
            xx,
            yy,
            test_size=vali_size,
            train_size=None,
            shuffle=shuffle,
        )
        return tx, ty, vx, vy, ex, ey

    def create_split(self, x: ndarray, y: ndarray, index: int) -> None:
        """
        Randomly generates a split.
        """
        tx, ty, vx, vy, ex, ey = self.train_val_test(x, y)
        print('Saving....')
        ds = self.get_split(index)
        dtrain = ds.train()
        dval = ds.validation()
        dtest = ds.test()
        dtrain.x().save(tx)
        dtrain.y().save(ty)
        dval.x().save(vx)
        dval.y().save(vy)
        dtest.x().save(ex)
        dtest.y().save(ey)

    def one_hot(self, y: ndarray, num_classes: int) -> ndarray:
        """
        Returns the one hot representation from an array of integers.
        """
        return to_categorical(y, num_classes=num_classes, dtype='int32')

    @abstractmethod
    def _predictions_factory(self) -> PredictionsFactory:
        """
        Abstract method.
        Returns an instance of PredictionsFactory.
        """
        pass

    def exists(self) -> bool:
        """
        Returns true if the dataset was already prepared.
        """
        for i in range(self.splits()):
            if not self.get_split(i).exists():
                return False
        return True

    @abstractmethod
    def splits(self) -> int:
        """
        Returns the number of splits.
        """
        pass