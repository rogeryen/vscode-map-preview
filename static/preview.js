function renderFeaturesHtml(selFeatures) {
    let html = "<div>";
    html += "<table>";
    let showFeatureHeader = (selFeatures.length > 1);

    let noAttributeCount = 0;
    for (let i = 0; i < selFeatures.length; i++) {
        let feat = selFeatures[i];
        let names = feat.getKeys();
        if (names.length == 1 && names[0] == feat.getGeometryName()) {
            noAttributeCount++;
        }
    }

    if (noAttributeCount == selFeatures.length) {
        return null;
    }

    for (let i = 0; i < selFeatures.length; i++) {
        let feat = selFeatures[i];
        if (showFeatureHeader) {
            html += "<tr><td colspan='2'>Feature" + (i + 1) + "</td></tr>";
        }
        let props = feat.getProperties();
        for (let key in props) {
            //Skip geometry
            if (key == feat.getGeometryName()) {
                continue;
            }
            html += "<tr>";
            html += "<td class='popup-attribute-key'>" + key + "</td>";
            html += "<td class='popup-attribute-value'>" + props[key] + "</td>";
            html += "</tr>";
        }
    }
    html += "</table>";
    html += "</div>";
    return html;
}

function strIsNullOrEmpty(str) {
    return str == null || str == "";
}

function tryReadFeatures(format, text, options) {
    try {
        return format.readFeatures(text, options);
    } catch (e) {
        return null;
    }
}

function createPreviewSource(previewContent, formatOptions, previewSettings, callback) {
    let projections = previewSettings.projections || [];
    if (projections.length > 0) {
        for (let i = 0; i < projections.length; i++) {
            let pj = projections[i];
            proj4.defs("EPSG:" + pj.epsgCode, pj.definition);
        }
        ol.proj.proj4.register(proj4);
    }

    const driverName = "GeoJSON";
    const driver = new ol.format.GeoJSON();

    for (const level in previewContent) {
        if (previewContent[level].level) {
            const features = tryReadFeatures(driver, previewContent[level].level, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature level. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].level = new ol.source.Vector({ features: features, wrapX: false });
        }

        if (previewContent[level].building) {
            const features = tryReadFeatures(driver, previewContent[level].building, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature building. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].building = new ol.source.Vector({ features: features, wrapX: false });
        }

        if (previewContent[level].space) {
            const features = tryReadFeatures(driver, previewContent[level].space, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature space. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].space = new ol.source.Vector({ features: features, wrapX: false });
        }

        if (previewContent[level].node) {
            const features = tryReadFeatures(driver, previewContent[level].node, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature node. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].node = new ol.source.Vector({ features: features, wrapX: false });
        }

        if (previewContent[level].obstruction) {
            const features = tryReadFeatures(driver, previewContent[level].obstruction, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature obstruction. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].obstruction = new ol.source.Vector({ features: features, wrapX: false });
        }

        if (previewContent[level].connection) {
            const features = tryReadFeatures(driver, previewContent[level].connection, formatOptions);
            if (!features || features.length == 0) {
                let attemptedFormats = [driverName];
                throw new Error(`Could not load preview content for level ${level}, feature connection. Attempted the following formats:<br/><br/><ul><li>` + attemptedFormats.join("</li><li>") + "</ul></li><p>Please make sure your document content is one of the above formats</p>");
            }
            previewContent[level].connection = new ol.source.Vector({ features: features, wrapX: false });
        }
    }

    callback({
        source: previewContent,
        driver: driverName
    });
}

function makeSelectInteraction(previewSettings) {
    let polygonStyle = new ol.style.Style({
        stroke: new ol.style.Stroke(previewSettings.selectionStyle.polygon.stroke),
        fill: new ol.style.Fill(previewSettings.selectionStyle.polygon.fill)
    });
    let lineStyle = new ol.style.Style({
        fill: new ol.style.Stroke({
            color: previewSettings.selectionStyle.line.stroke.color
        }),
        stroke: new ol.style.Stroke(previewSettings.selectionStyle.line.stroke)
    });
    let pointStyle = new ol.style.Style({
        image: new ol.style.Circle({
            radius: previewSettings.selectionStyle.point.radius || 5,
            stroke: new ol.style.Stroke(previewSettings.selectionStyle.point.stroke),
            fill: new ol.style.Fill(previewSettings.selectionStyle.point.fill)
        })
    });
    return new ol.interaction.Select({
        style: function (feature, resolution) {
            let geom = feature.getGeometry();
            if (geom) {
                let geomType = geom.getType();
                if (geomType.indexOf("Polygon") >= 0) {
                    return polygonStyle;
                } else if (geomType.indexOf("Line") >= 0) {
                    return lineStyle;
                } else if (geomType.indexOf("Point") >= 0) {
                    return pointStyle;
                }
            }
            return null;
        }
    });
}

function vertexImage(color, previewSettings) {
    return new ol.style.Circle({
        radius: previewSettings.style.vertex.radius,
        fill: new ol.style.Fill({
            color: color
        })
    });
}
function pointImage(color, previewSettings) {
    return new ol.style.Circle({
        radius: previewSettings.style.point.radius || 5,
        stroke: new ol.style.Stroke({
            color: color,
            width: previewSettings.style.point.stroke.width
        }),
        fill: new ol.style.Fill(previewSettings.style.point.fill)
    });
}

function clamp(value, min, max) {
    return Math.min(Math.max(min, value), max);
}

// support SimpleStyle for lines
function lineWithSimpleStyle(lineStyle, feature, previewSettings) {
    const properties = feature.getProperties();
    const color = properties['stroke'];
    if (color) {
        const sc = [...ol.color.asArray(color)];
        if (properties['stroke-opacity']) {
            sc[3] = clamp(properties['stroke-opacity'], 0.0, 1.0);
        }
        lineStyle[0].getStroke().setColor(sc);
        if (lineStyle.length > 1) {
            lineStyle[1].setImage(vertexImage(sc, previewSettings));
        }
    }
    const width = properties['stroke-width'];
    if (width) {
        lineStyle[0].getStroke().setWidth(width);
    }
    return lineStyle;
}

// support SimpleStyle for polygons
function polygonWithSimpleStyle(polygonStyle, feature, previewSettings) {
    const properties = feature.getProperties();
    const color = properties['stroke'];
    if (color) {
        const sc = [...ol.color.asArray(color)];
        if (properties['stroke-opacity']) {
            sc[3] = clamp(properties['stroke-opacity'], 0.0, 1.0);
        }
        polygonStyle[0].getStroke().setColor(sc);
        if (polygonStyle.length > 1) {
            polygonStyle[1].setImage(vertexImage(sc, previewSettings));
        }
    }
    const width = properties['stroke-width'];
    if (width) {
        polygonStyle[0].getStroke().setWidth(width);
    }
    const fillColor = properties['fill'];
    if (fillColor) {
        const fc = [...ol.color.asArray(fillColor)];
        if (properties['fill-opacity']) {
            fc[3] = clamp(properties['fill-opacity'], 0.0, 1.0);
        }
        polygonStyle[0].getFill().setColor(fc);
    }

    return polygonStyle;
}

// support SimpleStyle for points
function pointWithSimpleStyle(pointStyle, feature, previewSettings) {
    const properties = feature.getProperties();
    const color = properties['marker-color'];
    if (color) {
        const mc = [...ol.color.asArray(color)];
        pointStyle.setImage(pointImage(mc, previewSettings));
    }
    return pointStyle;
}

function initPreviewMap(domElId, preview, previewSettings) {
    let vertexStyle = null;
    if (previewSettings.style.vertex.enabled === true) {
        vertexStyle = new ol.style.Style({
            image: vertexImage(previewSettings.style.vertex.fill.color, previewSettings),
            geometry: function (feature) {
                let g = feature.getGeometry();
                let gt = g.getType();
                switch (gt) {
                    case "MultiPolygon":
                        {
                            let coords = g.getCoordinates();
                            let geoms = [];
                            for (let i = 0; i < coords.length; i++) {
                                let polyCoords = coords[i];
                                for (let j = 0; j < polyCoords.length; j++) {
                                    let pts = polyCoords[j];
                                    geoms.push(new ol.geom.MultiPoint(pts));
                                }
                            }
                            return new ol.geom.GeometryCollection(geoms);
                        }
                    case "MultiLineString":
                    case "Polygon":
                        {
                            let coords = g.getCoordinates();
                            let geoms = [];
                            for (let i = 0; i < coords.length; i++) {
                                let pts = coords[i];
                                geoms.push(new ol.geom.MultiPoint(pts));
                            }
                            return new ol.geom.GeometryCollection(geoms);
                        }
                    case "LineString":
                        {
                            let coords = g.getCoordinates();
                            let geoms = [];
                            for (let i = 0; i < coords.length; i++) {
                                let pts = coords[i];
                                geoms.push(new ol.geom.Point(pts));
                            }
                            return new ol.geom.GeometryCollection(geoms);
                        }
                }
                return g;
            }
        });
    }

    let polygonStyle = [new ol.style.Style({
        stroke: new ol.style.Stroke(previewSettings.style.polygon.stroke),
        fill: new ol.style.Fill(previewSettings.style.polygon.fill)
    })];
    if (vertexStyle) {
        polygonStyle.push(vertexStyle);
    }
    let levelStyle = [new ol.style.Style({
        stroke: new ol.style.Stroke(previewSettings.style.level.stroke),
        fill: new ol.style.Fill(previewSettings.style.level.fill)
    })];
    let obstructionStyle = [new ol.style.Style({
        stroke: new ol.style.Stroke(previewSettings.style.obstruction.stroke),
        fill: new ol.style.Fill(previewSettings.style.obstruction.fill)
    })];
    let buildingStyle = [new ol.style.Style({
        stroke: new ol.style.Stroke(previewSettings.style.building.stroke),
        fill: new ol.style.Fill(previewSettings.style.building.fill)
    })];
    let lineStyle = [new ol.style.Style({
        fill: new ol.style.Stroke({
            color: previewSettings.style.line.stroke.color
        }),
        stroke: new ol.style.Stroke(previewSettings.style.line.stroke)
    })];
    if (vertexStyle) {
        lineStyle.push(vertexStyle);
    }
    let pointStyle = new ol.style.Style({
        image: pointImage(previewSettings.style.point.stroke.color, previewSettings)
    });
    let connectionStyle = new ol.style.Style({
        image: pointImage(previewSettings.style.connection.stroke.color, previewSettings)
    });

    let levelGroups = [];

    for (const level in preview.source) {
        const elevation = preview.source[level].level.getFeatures()[0].getProperties()['elevation'] + '';

        const buildingLayer = new ol.layer.Vector({
            title: 'building',
            source: preview.source[level].building,
            style: function (feature, resolution) {
                return polygonWithSimpleStyle(buildingStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });
        const levelLayer = new ol.layer.Vector({
            title: 'level',
            source: preview.source[level].level,
            style: function (feature, resolution) {
                return polygonWithSimpleStyle(levelStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });
        const spaceLayer = new ol.layer.Vector({
            title: 'space',
            source: preview.source[level].space,
            style: function (feature, resolution) {
                return polygonWithSimpleStyle(polygonStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });
        const obstructionLayer = new ol.layer.Vector({
            title: 'obstruction',
            source: preview.source[level].obstruction,
            style: function (feature, resolution) {
                return polygonWithSimpleStyle(obstructionStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });
        const nodeLayer = new ol.layer.Vector({
            title: 'node',
            source: preview.source[level].node,
            style: function (feature, resolution) {
                return pointWithSimpleStyle(pointStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });
        const connectionLayer = new ol.layer.Vector({
            title: 'connection',
            source: preview.source[level].connection,
            style: function (feature, resolution) {
                return pointWithSimpleStyle(connectionStyle, feature, previewSettings);
            },
            declutter: previewSettings.declutterLabels,
        });

        const levelGroup = new ol.layer.Group({
            title: elevation,
            fold: 'close',
            layers: [
                buildingLayer,
                levelLayer,
                spaceLayer,
                obstructionLayer,
                nodeLayer,
                connectionLayer
            ],
        });
        levelGroups.push(levelGroup);
    }

    let map = new ol.Map({
        target: 'map',
        controls: ol.control.defaults({
            attributionOptions: {
                collapsible: true
            }
        }).extend([
            new ol.control.ScaleLine(),
            new ol.control.MousePosition({
                projection: (previewSettings.coordinateDisplay.projection || 'EPSG:4326'),
                coordinateFormat: function (coordinate) {
                    return ol.coordinate.format(coordinate, (previewSettings.coordinateDisplay.format || 'Lat: {y}, Lng: {x}'), 4);
                }
            }),
            new ol.control.ZoomSlider(),
            new ol.control.ZoomToExtent()
        ]),
        layers: [
            new ol.layer.Group({
                title: "Base Maps",
                layers: [
                    new ol.layer.Tile({
                        title: 'Stamen Toner',
                        type: 'base',
                        visible: (previewSettings.defaultBaseLayer == "stamen-toner"),
                        source: new ol.source.Stamen({
                            layer: 'toner'
                        })
                    }),
                    new ol.layer.Tile({
                        title: 'Stamen Watercolor',
                        type: 'base',
                        visible: (previewSettings.defaultBaseLayer == "stamen-water"),
                        source: new ol.source.Stamen({
                            layer: 'watercolor'
                        })
                    }),
                    new ol.layer.Tile({
                        title: 'Stamen Terrain',
                        type: 'base',
                        visible: (previewSettings.defaultBaseLayer == "stamen-terrain"),
                        source: new ol.source.Stamen({
                            layer: 'terrain'
                        })
                    }),
                    new ol.layer.Tile({
                        title: 'OpenStreetMap',
                        type: 'base',
                        visible: (previewSettings.defaultBaseLayer == "osm"),
                        source: new ol.source.OSM()
                    })
                ]
            }),
            new ol.layer.Group({
                title: "Floors",
                layers: levelGroups,
            })
        ]
    });
    let mapView = new ol.View();
    mapView.fit(preview.source[Object.keys(preview.source)[0]].building.getExtent(), map.getSize());
    map.setView(mapView);
    let popup = new Popup();
    map.addOverlay(popup);
    let layerSwitcher = new ol.control.LayerSwitcher({
        tipLabel: 'Legend' // Optional label for button
    });
    map.addControl(layerSwitcher);

    let select = makeSelectInteraction(previewSettings);
    map.addInteraction(select);

    select.on('select', function (evt) {
        let selFeatures = evt.selected;
        let html = renderFeaturesHtml(selFeatures);
        if (html)
            popup.show(evt.mapBrowserEvent.coordinate, html);
    });
}