"""Seed the exercise library with the predefined exercises.

Covers alternate picking, legato, tapping (monophonic — easiest to detect)
plus sweep picking (fast near-simultaneous runs; detection is best-effort).
Patterns are generated programmatically so they stay readable — see
Exercise.note_pattern docstring for the schema.

String numbering: 1 = high E ... 6 = low E, standard tuning.
Durations are in beats (0.25 = sixteenth note, 1/3 = triplet eighth).
"""

from django.core.management.base import BaseCommand

from exercises.models import Exercise, Technique

SIXTEENTH = 0.25
TRIPLET = round(1 / 3, 4)

DEFAULT_BPM_LEVELS = [60, 80, 100, 120, 140, 160]
TAPPING_BPM_LEVELS = [60, 80, 100, 120, 140]


def note(string, fret, duration=SIXTEENTH, marker="pick"):
    return {"string": string, "fret": fret, "duration": duration, "technique_marker": marker}


def chromatic_1234_across_strings():
    return [note(s, f) for s in range(6, 0, -1) for f in (1, 2, 3, 4)]


def chromatic_shifts_single_string():
    return [note(1, start + i) for start in (1, 2, 3, 4) for i in range(4)]


def am_pentatonic_run():
    box = [(6, 5), (6, 8), (5, 5), (5, 7), (4, 5), (4, 7), (3, 5), (3, 7), (2, 5), (2, 8), (1, 5), (1, 8)]
    return [note(s, f) for s, f in box]


def gilbert_sixes():
    cell = [(1, 8), (1, 5), (2, 8), (2, 5), (2, 7), (2, 5)]
    return [note(s, f) for _ in range(4) for s, f in cell]


AM_PENT_DESC = [(1, 8), (1, 5), (2, 8), (2, 5), (3, 7), (3, 5), (4, 7), (4, 5), (5, 7), (5, 5), (6, 8), (6, 5)]


def descending_fours():
    """Classic sequence: four descending notes starting from each scale degree."""
    return [note(s, f) for i in range(len(AM_PENT_DESC) - 3) for s, f in AM_PENT_DESC[i:i + 4]]


def string_skipping_pentatonic():
    box = [(6, 5), (6, 8), (4, 5), (4, 7), (2, 5), (2, 8), (4, 5), (4, 7)]
    return [note(s, f) for _ in range(3) for s, f in box]


def inside_picking_workout():
    cell = [(2, 5), (1, 5), (2, 7), (1, 7)]
    return [note(s, f) for _ in range(6) for s, f in cell]


AM_3NPS = [(6, 5), (6, 7), (6, 8), (5, 5), (5, 7), (5, 8), (4, 5), (4, 7), (4, 9),
           (3, 5), (3, 7), (3, 9), (2, 5), (2, 6), (2, 8), (1, 5), (1, 7), (1, 8)]


def am_3nps_picked():
    return [note(s, f) for s, f in AM_3NPS]


def am_3nps_legato_ascending():
    pattern = []
    current_string = None
    for s, f in AM_3NPS:
        marker = "pick" if s != current_string else "hammer"
        current_string = s
        pattern.append(note(s, f, marker=marker))
    return pattern


def am_3nps_legato_descending():
    pattern = []
    current_string = None
    for s, f in reversed(AM_3NPS):
        marker = "pick" if s != current_string else "pull"
        current_string = s
        pattern.append(note(s, f, marker=marker))
    return pattern


def trill_5_7():
    pattern = [note(2, 5)]
    for i in range(15):
        marker = "hammer" if i % 2 == 0 else "pull"
        pattern.append(note(2, 7 if i % 2 == 0 else 5, marker=marker))
    return pattern


def legato_rolls():
    pattern = []
    for s in (3, 2, 1):
        cell = [(5, "pick"), (7, "hammer"), (8, "hammer"), (7, "pull"), (5, "pull"), (7, "hammer")]
        pattern.extend(note(s, f, marker=m) for f, m in cell)
    return pattern


def chromatic_legato_crawl():
    """Pick only the first note of each four-note chromatic cell, hammer the rest."""
    pattern = []
    for start in (5, 6, 7, 8):
        pattern.append(note(2, start))
        pattern.extend(note(2, start + i, marker="hammer") for i in (1, 2, 3))
    return pattern


def pentatonic_legato_triplets():
    per_string = [(2, 5, 8), (1, 5, 8), (2, 5, 8), (1, 5, 8)]
    pattern = []
    for s, lo, hi in per_string:
        pattern.extend([
            note(s, lo, duration=TRIPLET),
            note(s, hi, duration=TRIPLET, marker="hammer"),
            note(s, lo, duration=TRIPLET, marker="pull"),
        ] * 2)
    return pattern


def pulloff_cascades():
    per_string = [(1, 12, 8, 5), (2, 13, 10, 8), (3, 14, 10, 7)]
    pattern = []
    for s, top, mid, low in per_string:
        cell = [note(s, top, duration=TRIPLET),
                note(s, mid, duration=TRIPLET, marker="pull"),
                note(s, low, duration=TRIPLET, marker="pull")]
        pattern.extend(cell * 2)
    return pattern


def vh_tap_triplets():
    cell = [(12, "tap"), (5, "pull"), (8, "hammer")]
    return [note(1, f, duration=TRIPLET, marker=m) for _ in range(8) for f, m in cell]


def tap_arpeggio_am_across_strings():
    per_string = [(1, 12, 5, 8), (2, 13, 5, 10), (3, 14, 5, 9), (4, 14, 7, 10)]
    pattern = []
    for s, tap_fret, low, mid in per_string:
        cell = [(tap_fret, "tap"), (low, "pull"), (mid, "hammer")]
        pattern.extend(note(s, f, duration=TRIPLET, marker=m) for _ in range(2) for f, m in cell)
    return pattern


def tapped_pentatonic_run():
    cells = [(1, 5, 8, 12), (1, 5, 8, 12), (2, 5, 8, 13), (2, 5, 8, 13)]
    pattern = []
    for s, a, b, t in cells:
        pattern.extend([
            note(s, a),
            note(s, b, marker="hammer"),
            note(s, t, marker="tap"),
            note(s, b, marker="pull"),
        ])
    return pattern


def tapped_scale_one_string():
    cells = [(5, 7, 8, 12), (7, 8, 10, 13), (8, 10, 12, 15), (10, 12, 13, 17)]
    pattern = []
    for a, b, c, t in cells:
        pattern.extend([
            note(1, a),
            note(1, b, marker="hammer"),
            note(1, c, marker="hammer"),
            note(1, t, marker="tap"),
        ])
    return pattern


def tapped_rolls_two_strings():
    per_string = [(1, 12, 8, 5), (2, 13, 10, 6)]
    pattern = []
    for s, tap, mid, low in per_string:
        cell = [note(s, tap, marker="tap"), note(s, mid, marker="pull"),
                note(s, low, marker="pull"), note(s, mid, marker="hammer")]
        pattern.extend(cell * 3)
    return pattern


def two_finger_tap_sixes():
    cell = [note(1, 5), note(1, 9, marker="hammer"), note(1, 12, marker="tap"),
            note(1, 15, marker="tap"), note(1, 12, marker="pull"), note(1, 9, marker="pull")]
    return [n.copy() for _ in range(4) for n in cell]


def em_tapped_triplets():
    cell = [note(1, 12, duration=TRIPLET, marker="tap"),
            note(1, 3, duration=TRIPLET, marker="pull"),
            note(1, 7, duration=TRIPLET, marker="hammer")]
    return [n.copy() for _ in range(8) for n in cell]


def sweep_updown(shape, repeats=4):
    """Ascend then descend a (string, fret) arpeggio shape, top note not repeated."""
    down = list(reversed(shape[:-1]))[:-1]  # skip repeated top and bottom notes
    cell = shape + down
    return [note(s, f, duration=TRIPLET) for _ in range(repeats) for s, f in cell]


# 3-string shapes, played strings 3→1 (top of the arpeggio last)
AM_SWEEP_3 = [(3, 14), (2, 13), (1, 12)]
A_MAJ_SWEEP_3 = [(3, 13), (2, 14), (1, 12)]
EM_SWEEP_3 = [(3, 9), (2, 8), (1, 7)]
C_MAJ_SWEEP_3 = [(3, 5), (2, 5), (1, 3)]
D_MAJ_SWEEP_3 = [(3, 7), (2, 7), (1, 5)]
G_MAJ_SWEEP_3 = [(3, 12), (2, 12), (1, 10)]
F_MAJ_SWEEP_3 = [(3, 10), (2, 10), (1, 8)]
# 5-string Am shape, strings 5→1 with a hammered top extension
AM_SWEEP_5 = [(5, 12), (4, 14), (3, 14), (2, 13), (1, 12)]


def am_sweep_3string():
    return sweep_updown(AM_SWEEP_3, repeats=6)


def amaj_sweep_3string():
    return sweep_updown(A_MAJ_SWEEP_3, repeats=6)


def em_sweep_3string():
    return sweep_updown(EM_SWEEP_3, repeats=6)


def minor_major_sweep_switch():
    return sweep_updown(AM_SWEEP_3, repeats=2) + sweep_updown(A_MAJ_SWEEP_3, repeats=2)


def cmaj_sweep_3string():
    return sweep_updown(C_MAJ_SWEEP_3, repeats=6)


def dmaj_sweep_3string():
    return sweep_updown(D_MAJ_SWEEP_3, repeats=6)


def am_g_f_sweep_progression():
    return (
        sweep_updown(AM_SWEEP_3, repeats=2)
        + sweep_updown(G_MAJ_SWEEP_3, repeats=2)
        + sweep_updown(F_MAJ_SWEEP_3, repeats=2)
    )


def am_sweep_5string():
    pattern = []
    for _ in range(4):
        up = [note(s, f, duration=TRIPLET) for s, f in AM_SWEEP_5]
        top = [note(1, 17, duration=TRIPLET, marker="hammer")]
        down = [
            note(1, 12, duration=TRIPLET, marker="pull"),
            *(note(s, f, duration=TRIPLET) for s, f in reversed(AM_SWEEP_5[:-1])),
        ]
        pattern.extend(up + top + down)
    return pattern


TECHNIQUES = [
    {
        "slug": "sweep_picking",
        "name": "Sweep Picking",
        "description": "One continuous pick stroke across strings, one note per string. Detection is best-effort at high speeds.",
        "exercises": [
            ("A minor 3-string sweep", "Up-down triplet sweep through the top-3-strings Am shape at the 12th position.", 2, am_sweep_3string),
            ("A major 3-string sweep", "Up-down triplet sweep through the A major shape — watch the middle-string fingering change.", 2, amaj_sweep_3string),
            ("E minor 3-string sweep", "Up-down triplet sweep through the Em shape at the 7th-9th frets.", 2, em_sweep_3string),
            ("Minor/major sweep switch", "Alternates Am and A major shapes to train shape transitions mid-sweep.", 3, minor_major_sweep_switch),
            ("A minor 5-string sweep", "Full 5-string Am sweep with a hammered 17th-fret extension on top.", 4, am_sweep_5string),
            ("C major 3-string sweep", "Up-down triplet sweep through the C major shape at the 3rd-5th frets.", 2, cmaj_sweep_3string),
            ("D major 3-string sweep", "Up-down triplet sweep through the D major shape at the 5th-7th frets.", 2, dmaj_sweep_3string),
            ("Am–G–F sweep progression", "Chains Am, G and F triad sweeps to practice moving one shape down the neck.", 3, am_g_f_sweep_progression),
        ],
    },
    {
        "slug": "alternate_picking",
        "name": "Alternate Picking",
        "description": "Strict down-up picking. The foundation of picked speed playing.",
        "exercises": [
            ("Chromatic 1-2-3-4 across strings", "Classic warm-up: four chromatic notes per string, low E to high E, strict alternate picking.", 1, chromatic_1234_across_strings),
            ("Chromatic shifts on one string", "1-2-3-4 pattern shifting up one fret per repetition on the high E string.", 1, chromatic_shifts_single_string),
            ("A minor pentatonic run", "Ascending A minor pentatonic box, two notes per string.", 2, am_pentatonic_run),
            ("Paul Gilbert sixes", "Six-note string-crossing cell on the top two strings, repeated four times.", 3, gilbert_sixes),
            ("A minor 3NPS scale run", "Three-note-per-string A minor scale, ascending, every note picked.", 2, am_3nps_picked),
            ("Descending fours", "Sequenced descending pentatonic: four notes down from each scale degree.", 3, descending_fours),
            ("String-skipping pentatonic", "A minor pentatonic with a skipped string between every pair — accuracy over speed.", 3, string_skipping_pentatonic),
            ("Inside picking workout", "Two-string cell forcing the harder inside pick strokes between B and E.", 2, inside_picking_workout),
        ],
    },
    {
        "slug": "legato",
        "name": "Legato",
        "description": "Hammer-ons and pull-offs: smooth lines with minimal picking.",
        "exercises": [
            ("5-7 trill on the B string", "Pick once, then alternate hammer-ons and pull-offs between frets 5 and 7.", 1, trill_5_7),
            ("A minor 3NPS legato ascending", "Three-note-per-string A minor scale; pick only the first note of each string, hammer the rest.", 2, am_3nps_legato_ascending),
            ("A minor 3NPS legato descending", "Descending 3NPS A minor scale using pull-offs; pick only on string changes.", 2, am_3nps_legato_descending),
            ("Legato rolls 5-7-8", "Six-note hammer/pull rolling cell moved across the top three strings.", 3, legato_rolls),
            ("Chromatic legato crawl", "Four-note chromatic cells on the B string — pick once, hammer the rest.", 1, chromatic_legato_crawl),
            ("Pentatonic legato triplets", "Hammer/pull triplet cell over the 5-8 pentatonic frets on the top two strings.", 2, pentatonic_legato_triplets),
            ("Pull-off cascades", "Descending three-note pull-off cells falling across the top three strings.", 3, pulloff_cascades),
        ],
    },
    {
        "slug": "tapping",
        "name": "Two-Hand Tapping",
        "description": "Right-hand taps combined with left-hand hammer-ons and pull-offs.",
        "exercises": [
            ("Classic 12-5-8 tap triplets", "Van Halen style: tap 12, pull off to 5, hammer 8 on the high E string, in triplets.", 2, vh_tap_triplets),
            ("A minor tapped arpeggios across strings", "Tap-pull-hammer triplet cell moved across the top four strings through A minor shapes.", 3, tap_arpeggio_am_across_strings),
            ("Tapped pentatonic run", "Four-note cell: two fretted notes plus a tapped extension, on the top two strings.", 2, tapped_pentatonic_run),
            ("Tapped scale on one string", "Three fretted scale notes plus a tapped fourth, shifting up the high E string.", 3, tapped_scale_one_string),
            ("E minor tapped triplets", "Wide-interval Em arpeggio on one string: tap 12, pull to 3, hammer 7.", 2, em_tapped_triplets),
            ("Tapped rolls on two strings", "Four-note tap/pull/hammer roll moved between the E and B strings.", 3, tapped_rolls_two_strings),
            ("Two-finger tap sixes", "Six-note cell with two tapping fingers (12 and 15) over a fretted 5-9 base.", 4, two_finger_tap_sixes),
        ],
    },
]


class Command(BaseCommand):
    help = "Seed techniques and predefined exercises (idempotent)."

    def handle(self, *args, **options):
        created_count = 0
        for tech_def in TECHNIQUES:
            technique, _ = Technique.objects.update_or_create(
                slug=tech_def["slug"],
                defaults={"name": tech_def["name"], "description": tech_def["description"]},
            )
            for name, description, difficulty, pattern_fn in tech_def["exercises"]:
                bpm_levels = TAPPING_BPM_LEVELS if tech_def["slug"] == "tapping" else DEFAULT_BPM_LEVELS
                _, created = Exercise.objects.update_or_create(
                    technique=technique,
                    name=name,
                    defaults={
                        "description": description,
                        "difficulty": difficulty,
                        "note_pattern": pattern_fn(),
                        "bpm_levels": bpm_levels,
                        "is_active": True,
                        "visibility": Exercise.VISIBILITY_SHARED,
                    },
                )
                created_count += created
        total = Exercise.objects.count()
        self.stdout.write(self.style.SUCCESS(f"Seeded. {created_count} new exercises, {total} total."))
