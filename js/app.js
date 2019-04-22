/*
 * Copyright 2017 Lukas Krejci
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

var CURRENT_RESULTS;

$(document).ready(wireUp);

function wireUp() {
  $("#progress").hide();
  $("#results").hide();

  $("#severity-value").on("input change", function () {
    var currentSeverity = Number(this.value);
    $("#severity-display").text(intToSeverity(currentSeverity));

    filter_results();
  }).change();

  $("#included-packages").change(filter_results);
  $("#excluded-packages").change(filter_results);

  $("#menu-icon").click(function (e) {
    $("#menu-icon").hide();
    $("#filter").toggleClass("show");
    e.stopPropagation();
  });

  var closeFilter = function () {
    var filter = $("#filter");
    if (filter.hasClass("show")) {
      filter.toggleClass("show");
      $("#menu-icon").show();
    }
  };

  $("#page").click(closeFilter);

  $("#filter-close").click(closeFilter);

  if (window.location.search !== undefined && window.location.search !== "") {
    var keyValues = window.location.search.substring(1).split("&");
    var queryParams = {};
    for (var i in keyValues) {
      var s = keyValues[i];
      var kv = s.split("=");
      queryParams[kv[0]] = kv[1];
    }

    var title = queryParams["title"];
    var key = queryParams["key"];
    var oldVersion = queryParams["old"];
    var newVersion = queryParams["new"];

    if (title !== undefined && key !== undefined && oldVersion !== undefined && newVersion !== undefined) {
      loadApiDiff(title, key, oldVersion, newVersion);
      return
    }
  }
    $("#results").html("<h5>Error</h5><div class='row'><pre class='left'>Failed to pass title, key, old and new query parameters.</pre></div>").show();
}

function isValue(val) {
  return val !== undefined && val !== null;
}

function filter_results() {
  var severityValue = Number($("#severity-value").val());

  var inclPkgs = $("#included-packages").val().split(/\s*,\s*/);
  var exclPkgs = $("#excluded-packages").val().split(/\s*,\s*/);

  var includedPackages = [];
  var excludedPackages = [];

  inclPkgs.forEach(function(re) {
    if (re.length > 0) {
      includedPackages.push(new RegExp(re));
    }
  });
  exclPkgs.forEach(function(re) {
    if (re.length > 0) {
      excludedPackages.push(new RegExp(re));
    }
  });

  var hideFiltered = function (el, role) {
    var elSev = Number(el.attr("data-max-severity"));

    var include = true;
    include = include && elSev >= severityValue;

    if (include && role === "class") {
      var pkg = el.attr("data-package-name");

      if (include && includedPackages.length > 0 && isValue(pkg)) {
        for(var i in includedPackages) {
          if (!includedPackages[i].test(pkg)) {
            include = false;
            break;
          }
        }
      }

      if (include && excludedPackages.length > 0 && isValue(pkg)) {
        for(var e in excludedPackages) {
          if (excludedPackages[e].test(pkg)) {
            include = false;
            break;
          }
        }
      }
    }

    if (!include) {
      el.hide();
      return true;
    } else {
      el.show();
      return false;
    }
  };

  var results = $("#results");

  results.queue("fx", function (next) {
    var someHidden = false;

    results.find("div[data-role='class']").each(function() {
      var self = $(this);
      if (hideFiltered(self, "class")) {
        someHidden = true;
      } else {
        var allHidden = true;
        self.find("div[data-role='difference']").each(function() {
          if (hideFiltered($(this), "difference")) {
            someHidden = true;
          } else {
            allHidden = false;
          }
        });
        if (allHidden) {
          self.hide();
        }
      }
    });

    if (someHidden) {
      $("#not-not-all-results-shown").show();
    } else {
      $("#not-not-all-results-shown").hide();
    }

    next();
  });
}

function loadApiDiff(title, key, oldVersion, newVersion) {
  $.ajax({
    "beforeSend": function () {
      $("#progress").show();
      $("#results").hide().html("");
      $("#not-not-all-results-shown").hide();
      $("#progress-rendering-stage").html("Loading API diff file. This may take a while...");
    },
    "url": key + "-" + oldVersion + "-to-" + newVersion + ".json",
    "error": function () {
      CURRENT_RESULTS = null;
      $("#results").html("<h5>Error</h5><div class='row'><pre class='left'>Unable to locate API diff file.</pre></div>");
    },
    "converters": {
      "text json": true
    },
    "success": function (response) {
      $("#progress-rendering-stage").html("Rendering the results...");
      CURRENT_RESULTS = $.parseJSON(response);
      layoutResults();
    }
  }).always(function () {
    var res = $("#results");

    var pageTitle = escapeHtml(title) + " API Diff: v" + escapeHtml(oldVersion) + " to v" + escapeHtml(newVersion);
    $("#main-title").text(pageTitle);
    document.title = pageTitle;

    $("#progress").hide();

    setTimeout(function () {
      filter_results();
      res.show();
    }, 500);

    $('html, body').animate({
      scrollTop: res.offset().top
    }, 500);
  });
}

function layoutResults() {
  layoutModuleFiltering();

  if (CURRENT_RESULTS.length === 0) {
    $("#results").html("<div>No API differences found. Yay!</div>");
    return;
  }

  $.get("js/by-class.mustache", function (tmpl) {
    var data = transformResultsByClass(CURRENT_RESULTS);
    $("#results").html(Mustache.render(tmpl, data));
  });
}

function layoutModuleFiltering() {
  var inclMods = $("#include-modules");
  inclMods.children().remove();

  if (CURRENT_RESULTS.length === 0) {
    inclMods.html("Filtering by modules doesn't make sense with no API differences.");
    return;
  }

  var modules = {};

  CURRENT_RESULTS.forEach(function (d) {
    if (isValue(d["oldElementModule"]) && d["oldElementModule"].length > 0) {
      modules[d["oldElementModule"]] = true;
    }

    if (isValue(d["newElementModule"]) && d["newElementModule"].length > 0) {
      modules[d["newElementModule"]] = true;
    }
  });

  var inclhtml = "";
  for (m in modules) {
    inclhtml += "<div><input type='checkbox' id='incl-module-" + m + "' name = 'incl-module-" + m + "' checked onchange='filter_results()'/><label for='incl-module-" + m + "' class='filter-selection'>" + escapeHtml(m) + "</label></div>";
  }

  inclMods.html(inclhtml);
}

function transformResultsByClass(diffs) {
  var byClass = {};

  diffs.forEach(function (d) {
    var className = d["attachments"]["package"] + "." + d["attachments"]["classSimpleName"];

    var classDef = byClass[className];
    if (classDef === undefined) {
      classDef = {};
      byClass[className] = classDef;
      classDef["className"] = className;
      classDef["packageName"] = d["attachments"]["package"];
    }

    var classDiffs = classDef["differences"];
    if (classDiffs === undefined) {
      classDiffs = [];
      classDef["differences"] = classDiffs;
    }

    if (d["oldElement"] !== null) {
      d["oldElement"] = elementSignatureToHtml(d["oldElement"]);
    }

    if (d["newElement"] !== null) {
      d["newElement"] = elementSignatureToHtml(d["newElement"]);
    }

    var maxSeverity = -1;
    for (var i in d["classification"]) {
      var currSev = severityToInt(d["classification"][i]);
      if (currSev > maxSeverity) {
        maxSeverity = currSev;
      }
    }
    d["maxSeverity"] = maxSeverity;

    var indirectUseSuffix = "API)";

    d["indirectlyInOldApi"] = false;
    var oldExample = d["attachments"]["exampleUseChainInOldApi"];

    if (oldExample !== undefined && oldExample.substr(-indirectUseSuffix.length) === indirectUseSuffix) {
      var ex = oldExample.split(" <- ").map(function (c) { return {"example" : c}});
      ex[ex.length - 1].last = true;
      d["exampleUseChainInOldApi"] = ex;
      d["indirectlyInOldApi"] = true;
    }

    d["directlyInNewApi"] = false;
    var newExample = d["attachments"]["exampleUseChainInNewApi"];
    if (newExample !== undefined && newExample.substr(-indirectUseSuffix.length) === indirectUseSuffix) {
      ex = newExample.split(" <- ").map(function (c) { return {"example" : c}});
      ex[ex.length - 1].last = true;
      d["exampleUseChainInNewApi"] = ex;
      d["indirectlyInNewApi"] = true;
    }

    classDiffs.push(d);
  });

  var types = [];

  for (var i in byClass) {
    var type = byClass[i];

    var maxSeverity = -1;
    for (var j in type["differences"]) {
      var curSev = type["differences"][j]["maxSeverity"];
      if (curSev > maxSeverity) {
        maxSeverity = curSev;
      }
    }
    type["maxSeverity"] = maxSeverity;

    types.push(type);
  }

  return {"types": types};
}

function elementSignatureToHtml(signature) {
  var p = new nearley.Parser(grammar.ParserRules, grammar.ParserStart);

  var parsedSignature = signature;

  try {
    parsedSignature = p.feed(signature);
  } catch (e) {
    console.error("Failed to parse \"" + signature + "\" with error " + e);
    return;
  }

  parsedSignature = parsedSignature["results"][0][0];

  var elementType = parsedSignature["elementType"];

  var ret = "<span class='element-type'>" + elementType + "</span>&nbsp;";

  switch (elementType) {
    case "class":
    case "missing-class":
    case "interface":
    case "enum":
    case "@interface":
      ret += typeToHtml(parsedSignature, "reported-type");
      break;
    case "field":
      ret += typeToHtml(parsedSignature, "reported-type");
      ret += "<span class='keyword'>.</span><span class='method-name'>" + parsedSignature["fieldName"] + "</span>"
      break;
    case "method":
      ret += typeParametersToHtml(parsedSignature["typeParameters"]);
      ret += "&nbsp;";
      ret += typeToHtml(parsedSignature["returnType"], "return-type");
      ret += "&nbsp;";
      ret += typeToHtml(parsedSignature["declaringType"], "declaring-type");
      ret += "<span class='keyword'>::</span><span class='method-name'>" + parsedSignature["methodName"] + "</span>";
      ret += parametersToHtml(parsedSignature["parameters"]);
      if (parsedSignature["reportingType"] !== null) {
        ret += "&nbsp;<span class='keyword'>@</span>&nbsp;" + typeToHtml(parsedSignature["reportingType"], "reporting-type");
      }
      break;
    case "parameter":
      ret += typeParametersToHtml(parsedSignature["typeParameters"]);
      ret += "&nbsp;";
      ret += typeToHtml(parsedSignature["returnType"], "return-type");
      ret += "&nbsp;";
      ret += typeToHtml(parsedSignature["declaringType"], "declaring-type");
      ret += "<span class='keyword'>::</span><span>" + parsedSignature["methodName"] + "</span>";
      ret += parametersToHtml(parsedSignature["parameters"], parsedSignature["selectedParameterIndex"]);
      if (parsedSignature["reportingType"] !== null) {
        ret += "&nbsp;<span class='keyword'>@</span>&nbsp;" + typeToHtml(parsedSignature["reportingType"], "reporting-type");
      }
      break;
  }

  return ret;
}

function typeParametersToHtml(typeParameters) {
  if (typeParameters == null || typeParameters === undefined || typeParameters.length === 0) {
    return "";
  }

  var ret = "<span class='type-parameters'><span class='keyword'>&lt;</span>";

  var tpHtmls = [];
  typeParameters.forEach(function (tp) {
    var typeHtml = null;
    if (tp["type"] instanceof Object) {
      typeHtml = typeToHtml(tp["type"], "type");
    } else {
      typeHtml = "<span class='keyword'>?</span>";
    }

    if (tp["bound"] !== null) {
      typeHtml += typeBoundToHtml(tp["bound"]);
    }

    tpHtmls.push("<span class='type-parameter'>" + typeHtml + "</span>");
  });

  ret += tpHtmls.join(", ");

  return ret + "<span class='keyword'>&gt;</span></span>";
}

function typeBoundToHtml(bnd) {
  if (bnd === null) {
    return;
  }

  var html = "&nbsp;<span class='keyword'>" + bnd["kind"] + "</span>&nbsp;" + typeToHtml(bnd["boundType"], "type");
  if (bnd["specialization"] !== null) {
    html += typeBoundToHtml(bnd["specialization"]);
  }

  return html;
}

function typeToHtml(type, cssClass) {
  if (type === null || type === undefined) {
    return "";
  }

  return "<span class='" + cssClass + "'>" + type["type"] + typeParametersToHtml(type["typeParameters"])
      + (new Array(1 + type["arrayDimension"]).join("[]")) + "</span>";
}

function parametersToHtml(parameters, highlightIndex) {
  var ret = "<span class='keyword'>(</span><span class='method-parameters'>";

  var putComma = false;
  for (var i = 0; i < parameters.length; ++i) {
    if (putComma) {
      ret += ", ";
    }
    putComma = true;
    if (i !== highlightIndex) {
      ret += typeToHtml(parameters[i], "method-parameter");
    } else {
      ret += typeToHtml(parameters[i], "reported-method-parameter");
    }
  }

  return ret + "</span><span class='keyword'>)</span>";
}

function severityToInt(severity) {
  if (typeof(severity) !== "string") {
    severity = String(severity);
  }
  switch (severity) {
    case "EQUIVALENT":
      return 0;
    case "NON_BREAKING":
      return 1;
    case "POTENTIALLY_BREAKING":
      return 2;
    case "BREAKING":
      return 3;
  }
}

function intToSeverity(integer) {
  if (typeof(integer) !== "number") {
    integer = Number(integer);
  }
  switch (integer) {
    case 0:
      return "EQUIVALENT";
    case 1:
      return "NON_BREAKING";
    case 2:
      return "POTENTIALLY_BREAKING";
    case 3:
      return "BREAKING";
  }
}

var entityMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

function escapeHtml (string) {
  return String(string).replace(/[&<>"'`=\/]/g, function (s) {
    return entityMap[s];
  });
}
