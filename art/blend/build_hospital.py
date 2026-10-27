# Art track A1: the procedural hospital, built in Blender from art/blend/rooms.json.
# Run inside Blender (MCP for Blender, or Scripting > Run Script) after `pnpm art:rooms`.
# It rebuilds the "hospital" collection, saves art/blend/hospital.blend and exports
# public/models/hospital.glb (+Y up, Draco geometry, custom properties as glTF extras).
#
# Blender is Z up: blender (x, y, z) = three.js (x, -z, y), so north rooms (three z < 0) sit at +y.
# Each floor is an empty named floor_<BUILDING>_L<level>; its children are laid out exactly as
# lib/map/layout.ts lays them out, relative to the empty. The empties are spread apart here so
# the floors can be seen side by side; the app places the floor it shows at the origin.
#
#   floor_MAIN_L0             empty
#     corridor_MAIN_L0        corridor floor
#     room_<GLN>              room floor slab (extras: gln, name, roomType)
#       walls_<GLN>           cut-away walls with a doorway onto the corridor

import json
import os

import bmesh
import bpy

ROOT = os.environ.get("MEDASSET_ROOT", r"C:\Users\mobol\Downloads\med-eq")
ROOMS_JSON = os.path.join(ROOT, "art", "blend", "rooms.json")
BLEND_OUT = os.path.join(ROOT, "art", "blend", "hospital.blend")
GLB_OUT = os.path.join(ROOT, "public", "models", "hospital.glb")

WALL = 0.075  # each room's own wall; two neighbours make the 0.15 m gap in layout.ts
CUT_HEIGHT = 0.9  # walls cut away, as in the placeholder map, so devices stay visible
SLAB = 0.06  # room floor thickness, top at 0.06 m
CORRIDOR_SLAB = 0.02
DOOR = {"ward": 1.6, "equipment_library": 1.6, "theatre": 1.6, "workshop": 1.4}  # others 1.2 m

# Floor colours match ROOM_COLOR in components/3d/floor-map.tsx.
ROOM_COLOR = {
    "ward": "#e0f2fe",
    "single_room": "#ecfeff",
    "theatre": "#ede9fe",
    "equipment_library": "#dcfce7",
    "workshop": "#fef9c3",
    "store_room": "#f4f4f5",
    "other": "#fafafa",
}
WALL_COLOR = "#a1a1aa"
CORRIDOR_COLOR = "#d4d4d8"

# Where each floor's empty sits in the .blend: storeys 4 m apart, buildings side by side.
STOREY = 4.0
BUILDING_OFFSET_Y = {"MAIN": 0.0, "OPD": -24.0}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_colour, roughness=0.8):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    rgb = [srgb_to_linear(int(hex_colour[i : i + 2], 16) / 255) for i in (1, 3, 5)]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def box_mesh(name, boxes, mat):
    """One mesh from axis-aligned boxes given as (cx, cy, cz, sx, sy, sz)."""
    bm = bmesh.new()
    for cx, cy, cz, sx, sy, sz in boxes:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        for v in geom["verts"]:
            v.co.x = cx + v.co.x * sx
            v.co.y = cy + v.co.y * sy
            v.co.z = cz + v.co.z * sz
    mesh = bpy.data.meshes.get(name) or bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.clear()
    mesh.materials.append(mat)
    return mesh


def new_object(name, data, parent, collection, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.parent = parent
    collection.objects.link(obj)
    return obj


def room_walls(room):
    """Four cut-away walls just outside the room's footprint, with a doorway on the corridor side."""
    w, d, h = room["width"], room["depth"], CUT_HEIGHT
    zc = h / 2
    # North rooms (three z < 0) are at +y in Blender, so their corridor wall faces -y.
    corridor_sign = -1 if room["corridorSide"] == "north" else 1
    far_sign = -corridor_sign
    door = min(DOOR.get(room["roomType"], 1.2), w - 0.6)
    side = (w + 2 * WALL - door) / 2  # each wall piece either side of the doorway
    y_near = corridor_sign * (d / 2 + WALL / 2)
    return [
        # far wall, full length
        (0.0, far_sign * (d / 2 + WALL / 2), zc, w + 2 * WALL, WALL, h),
        # corridor wall, split by the doorway
        (-(door / 2 + side / 2), y_near, zc, side, WALL, h),
        (door / 2 + side / 2, y_near, zc, side, WALL, h),
        # end walls
        (-(w / 2 + WALL / 2), 0.0, zc, WALL, d, h),
        (w / 2 + WALL / 2, 0.0, zc, WALL, d, h),
    ]


def clear_collection(name):
    coll = bpy.data.collections.get(name)
    if coll:
        for obj in list(coll.all_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(coll)
    for mesh in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(mesh)


def build():
    with open(ROOMS_JSON, encoding="utf-8") as f:
        spec = json.load(f)

    clear_collection("hospital")
    coll = bpy.data.collections.new("hospital")
    bpy.context.scene.collection.children.link(coll)

    wall_mat = material("mat_wall", WALL_COLOR)
    corridor_mat = material("mat_corridor", CORRIDOR_COLOR)
    room_mats = {t: material(f"mat_room_{t}", c) for t, c in ROOM_COLOR.items()}

    rooms_built = 0
    for fl in spec["floors"]:
        code = fl["building"]["code"]
        floor = new_object(fl["nodeName"], None, None, coll,
                           (0.0, BUILDING_OFFSET_Y.get(code, 0.0), fl["level"] * STOREY))
        floor.empty_display_type = "PLAIN_AXES"
        floor["building"] = fl["building"]["name"]
        floor["level"] = fl["level"]
        floor["floorName"] = fl["name"]

        c = fl["corridor"]
        cname = f"corridor_{code}_L{fl['level']}"
        new_object(cname, box_mesh(cname, [(0, 0, CORRIDOR_SLAB / 2, c["length"], c["width"], CORRIDOR_SLAB)], corridor_mat),
                   floor, coll, (c["x"], -c["z"], 0.0))

        for r in fl["rooms"]:
            mat = room_mats.get(r["roomType"], room_mats["other"])
            room = new_object(r["meshName"], box_mesh(r["meshName"], [(0, 0, SLAB / 2, r["width"], r["depth"], SLAB)], mat),
                              floor, coll, (r["x"], -r["z"], 0.0))
            room["gln"] = r["gln"]
            room["name"] = r["name"]
            room["roomType"] = r["roomType"]
            wname = f"walls_{r['gln']}"
            new_object(wname, box_mesh(wname, room_walls(r), wall_mat), room, coll)
            rooms_built += 1

    tris = sum(len(p.vertices) - 2 for o in coll.all_objects if o.type == "MESH" for p in o.data.polygons)
    print(f"built {len(spec['floors'])} floors, {rooms_built} rooms, {tris} triangles")
    return coll


def export(coll):
    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in coll.all_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    bpy.ops.object.select_all(action="DESELECT")
    print(f"exported {GLB_OUT} ({os.path.getsize(GLB_OUT)} bytes)")


coll = build()
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
export(coll)
