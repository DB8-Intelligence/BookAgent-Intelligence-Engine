# video/templates.py

VIDEO_TEMPLATES = {
    "slideshow_classico": {
        "name": "Slideshow Clássico",
        "clip_duration": 5,
        "transition_duration": 0.8,
        "fps": 30,
        "size": (1080, 1920),
        "min_photos": 3,
        "max_photos": 15,
    },
    "tour_ambientes": {
        "name": "Tour de Ambientes",
        "clip_duration": 4,
        "transition_duration": 0.6,
        "fps": 30,
        "size": (1080, 1920),
        "min_photos": 5,
        "max_photos": 15,
    },
    "highlight_reel": {
        "name": "Highlight Reel",
        "clip_duration": 3,
        "transition_duration": 0.5,
        "fps": 30,
        "size": (1080, 1920),
        "min_photos": 3,
        "max_photos": 5,
    },
}

MUSIC_MOODS = {
    "luxo":     "musics/luxo.mp3",
    "praia":    "musics/praia.mp3",
    "urbano":   "musics/urbano.mp3",
    "campo":    "musics/campo.mp3",
    "familiar": "musics/familiar.mp3",
    "neutro":   "musics/neutro.mp3",
    "none":     None,
}
