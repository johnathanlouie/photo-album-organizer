from argparse import ArgumentParser, Namespace
from typing import List

import cv2
from cc import CcrCategorical
from deeplearning import DeepLearningFactory
from jl import TEXT_CLUSTER_SIFT, ImageDirectory, ListFile, Url, mkdirs
from rater import Smi13_1
from sift import create_cluster, create_desc_file


def copy_img(image: Url, destination: Url) -> None:
    """
    Makes a copy of an image to another location.
    """
    x = cv2.imread(image, cv2.IMREAD_COLOR)
    new_url = "out/summarized/%s.jpg" % destination
    mkdirs(new_url)
    cv2.imwrite(new_url, x)
    return


def proc_args() -> Namespace:
    """
    Parses program arguments.
    """
    parser = ArgumentParser(description='A program that chooses the most representative photos from a photo album.')
    parser.add_argument('directory', help='')
    args = parser.parse_args()
    return args


def cluster_number(a: List[int]) -> int:
    """
    Returns the number of clusters in the clusters text file.
    """
    max_ = -1
    for i in a:
        if i > max_:
            max_ = i
    return max_ + 1


class ImageRating(object):
    """
    Struct for holding the URL and rating of an image.
    Used by the ClusterRank class.
    """

    def __init__(self, image: Url = '', rating: int = -1) -> None:
        self.image = image
        self.rating = rating
        return

    def update_if_better(self, image: Url, rating: int) -> bool:
        """
        Updates the data if the new image is better.
        """
        if self.rating < rating:
            self.image = image
            self.rating = rating
            return True
        return False


class ClusterRank(object):
    """
    A ranking system that picks the best out of each cluster.
    """

    def __init__(self, clusters: List[int], rates: List[float], images: List[Url]) -> None:
        self._best = [ImageRating() for _ in range(cluster_number(clusters))]
        for c, r, i in zip(clusters, rates, images):
            self._best[c].update_if_better(i, r)
        return

    def copy_images(self) -> None:
        """
        Makes a copy of each image in this summarized collection to a new location.
        """
        for cluster, image_rating in enumerate(self._best):
            print("Image %2d / %d" % (cluster + 1, len(self._best)))
            copy_img(image_rating.image, cluster)
        return


def main():
    args = proc_args()
    url = args.directory
    create_desc_file(url)
    create_cluster()
    s = DeepLearningFactory.create_split('smi1', 'ccrc', 0, 14, 0, 0)
    s.predict2(url)
    print('Loading clusters....')
    clusters = ListFile(TEXT_CLUSTER_SIFT).read_as_int()
    print('Loading rates....')
    rates = ListFile(s.name().predictions()).read_as_floats()
    print('Loading images....')
    images = ImageDirectory(url).jpeg()
    print('Ranking results....')
    cr = ClusterRank(clusters, rates, images)
    print('Making summarized album at out/summarized....')
    cr.copy_images()
    return


main()