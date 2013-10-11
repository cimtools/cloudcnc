$(document).ready(function(){ 
	// $( "#editorDiv").load( "examples/simple.cnc" );
	$( "#editorDiv").load( "examples/complete.cnc" );

	initScreen();

	$(window).resize(function () { 
		initScreen();
	});

	$("#btnStart").click(function (){

		if($(this).data("status") === "start"){
			setRunning();
			executeProgram();
		} else if ($(this).data("status") === "running") {
			setStopped();
			programHandler.pauseProgram();
			// $(this).data("status", "pause");
		} else if ($(this).data("status") === "paused") {						
			resume();
			setRunning();
		} else if ($(this).data("status") === "stopped") {						
			setRunning();
			programHandler.resumeProgram();
		}
	});

	

	context.codeRunner = new Worker('js/parser.js');
	context.speedBreaker = new Worker('js/speedbreaker.js');
	context.codeRunner.addEventListener('message', function(e){
		
		context.speedBreaker.postMessage(e.data);
	}, false);

	$("#speedSlider").change(function(){
		// console.log("slider value = " + $(this).val());
		context.speedBreaker.postMessage({type: 'setSpeed', speed: $(this).val()});
	});
	context.speedBreaker.postMessage({type: 'setSpeed', speed: $('#speedSlider').val()});

});

function setStopped(){
	$("#btnStart").data("status", "stopped");
	$("#btnStart").addClass("axnStart");
	$("#btnStart").removeClass("axnPause");	
}

function setReset(){
	$("#btnStart").data("status", "start");
	$("#btnStart").addClass("axnStart");
	$("#btnStart").removeClass("axnPause");	
}

function setRunning(){
	$("#btnStart").data("status", "running");
	$("#btnStart").removeClass("axnStart");
	$("#btnStart").addClass("axnPause");
}

function setPaused(){
	$("#btnStart").data("status", "paused");
	$("#btnStart").addClass("axnStart");
	$("#btnStart").removeClass("axnPause");	
}

function stop(){
	context.codeRunner && context.codeRunner.terminate();
}

function resume(){
			programHandler.removeBreakPoint();
}

function setBreakPoint(e){
	programHandler.setBreakPoint($(e).data("index"));
	$(e).parent().addClass("breakPoint");
}

function createRunTimeEditor(codeLineArray){
	
	var editorWidth =  $("#editorDiv").width();
	var editorHeight =  $("#editorDiv").height();
	var lineNumbersWidth = $("#lineNumbers").width();

	$("#lineNumbers").hide();
	$("#editorDiv").hide();

	var editor = document.getElementById('editor');
	var runtimeEditor = document.createElement('div');

	runtimeEditor.setAttribute('class', 'runtimeEditor');
	runtimeEditor.setAttribute('id', 'runtimeEditor');
	
	$(runtimeEditor).width(editorWidth + lineNumbersWidth);
	$(runtimeEditor).height(editorHeight);

	for(var index = 0; index < codeLineArray.length; index++){
		var rowDiv = document.createElement('div');
		rowDiv.setAttribute('id', 'row-' + index);
		rowDiv.setAttribute('class', 'row');
		
		var breakPointDiv = document.createElement('div');
		breakPointDiv.setAttribute('id', 'breakPointDiv-' + index);
		
		breakPointDiv.setAttribute('class', 'breakPointArea');
		breakPointDiv.setAttribute('onClick', 'setBreakPoint(this)');
		$(breakPointDiv).data("index", index);

		rowDiv.appendChild(breakPointDiv);

		var codeText = document.createElement('div');
		codeText.setAttribute('id', 'codeText-' + index);
		$(codeText).html(highlight(codeLineArray[index]));

		rowDiv.appendChild(codeText);
		runtimeEditor.appendChild(rowDiv);
	}

	editor.appendChild(runtimeEditor);
}


function highlight(code){
	var text = code.replace('G', "<span id='gcode'>G</span>");
	text = text.replace('M', "<span id='gcode'>M</span>");
	text = text.replace('W', "<span id='gcode'>W</span>");
	text = text.replace('U', "<span id='gcode'>U</span>");
	text = text.replace('F', "<span id='gcode'>F</span>");
	text = text.replace('X', "<span id='variables'>X</span>");
	text = text.replace('Z', "<span id='variables'>Z</span>");
	text = text.replace('R', "<span id='variables'>R</span>");
	return text;
}

function executeProgram (){
	// fire google analytics event tracking
	ga('send', 'event', 'Simulation', 'Run');
	
	var handler = programHandler;
	var scrollPosition = 20;
	var scrollValue = 20;
	
	handler.reset($('#editorDiv').val());

	createRunTimeEditor(handler.getAllCodeLinesAsArray());

	var billet = handler.getBillet();
	
	if(!billet) return;

	graphics.initSimulation();
	graphics.reset();
	graphics.drawBillet(billet);

	var codeLine = handler.getNextCodeLine();

	console.log('Now executing: ' + codeLine.cncCode);

	context.codeRunner.postMessage(codeLine);

	context.speedBreaker.addEventListener('message', function(e){

		// Draw tool
		if(e.data.type === "toolDrawPoint") {
			if(context.prevPoint) {
				graphics.drawGhostTool(context.prevPoint);
			}

			graphics.drawTool(e.data.position);
			context.prevPoint = e.data.position;
			return;
		}

		if(e.data.type === 'BreakPoint' || handler.isBreakPoint()) {

			if(handler.isBreakPoint()){
				if (handler.isProgramPaused()) {
					setStopped();
				} else {
					setPaused();
				}

				context.codeRunner.postMessage({type: "BreakPoint"});
				return;
			}
		}

		if(e.data.type === 'parsingComplete' || e.data.type === 'BreakPoint'){

			try {
				context.codeRunner.postMessage(handler.getNextCodeLine());

				var currentLine = handler.getCurrentLine();

				$("#row-" + (currentLine -1)).removeClass("currentLine");
				$("#row-" + currentLine).addClass("currentLine");

				scrollScrollbar(currentLine);

			} catch (err){
				var currentLine = handler.getCurrentLine();
				// setReset();
				$("#row-" + (currentLine -1)).removeClass("currentLine");
				$("#runtimeEditor").animate({scrollTop : 0}, 700);
				console.log(err);
				return;
			}
		}		
	});
}

function scrollScrollbar(currentLineNumber){
	var topDistance = currentLineNumber * config.homeProperties.lineHeight;
	var editorHeight = $("#editorDiv").height();
	var scrollValue = topDistance - editorHeight;
	if(scrollValue > $("#runtimeEditor").scrollTop())
		$("#runtimeEditor").scrollTop(scrollValue + config.homeProperties.lineHeight);
}


// input: array of code lines
// returns: Billet object {radius: value, length: value}
// throws: exception if [BILLET, X\d or Z\d not found
function getBillet(codeArray){
	
	var billetLine;
	var found = false;
	

	for(line in codeArray){
		billetLine = codeArray[line];
		if(billetLine.indexOf('[BILLET') >= 0) {
			found = true;
			break;
		}
	}

	if(!found){
		var errMessage = 'Billet size not found';
		console.log(errMessage);
		throw  errMessage;
	}

	var radiusPattern = /\sX\d+\s/;
	var radius = radiusPattern.exec(billetLine);

	if(!radius){
		var errMessage = 'Billet radius not found';
		console.log(errMessage);
		throw  errMessage;
	}

	var lengthPattern = /\sZ\d+\s?/;
	var length = lengthPattern.exec(billetLine);

	if(!length){
		var errMessage = 'Billet length not found';
		console.log(errMessage);
		throw  errMessage;
	}

	

	var numberPattern = /\d+/;

	radius = numberPattern.exec(radius);
	length = numberPattern.exec(length);
	
	var billet = {'radius':radius[0], 'length': length[0], 'properties': config.billetProperties};

	return billet;
}

function initScreen(){

	

	var windowHeight = $(window).height();
	var windowWidth = $(window).width();
	
	// Setting toolbar
	$('#toolbar').css('height',  config.homeProperties.toolbarHeight + 'px');

	// Setting editor
	$('#editor').css('height', (windowHeight - config.homeProperties.toolbarHeight - config.homeProperties.footerHeight) + 'px');
	$('#editor').css('width', config.homeProperties.editorWidth + 'px');

	// Line numbers
	$('#lineNumbers').css('height', (windowHeight - config.homeProperties.toolbarHeight - config.homeProperties.footerHeight) + 'px');
	$('#lineNumbers').css('width' , (config.homeProperties.lineNumbersWidth) + 'px');

	// Setting editorDiv
	$('#editorDiv').css('height', (windowHeight - config.homeProperties.toolbarHeight - config.homeProperties.footerHeight) + 'px');
	$('#editorDiv').width((config.homeProperties.editorWidth - config.homeProperties.lineNumbersWidth) + 'px');
	// $('#editorDiv').css('padding-left', config.leftPadding + 'px');
	// $('#editorDiv').css('padding-top', config.topPadding + 'px');

	// Setting simulator
	$('#simulator').css('height', (windowHeight - config.homeProperties.toolbarHeight - config.homeProperties.footerHeight) + 'px');
	$('#simulator').css('width' , (windowWidth - config.homeProperties.editorWidth) + 'px');


	// Setting footer	
	$('#footer').css('height', config.homeProperties.footerHeight + 'px');

	// // Options overlay
	// $('#options').css('height', (window.innerHeight - config.toolbarHeight - config.footerHeight) + 'px');



	// Setting CNC
	$( "#cncCanvas" ).remove();
	var cnc = document.createElement('canvas');
	cnc.setAttribute('id', 'cncCanvas');
	cnc.height = (windowHeight - config.homeProperties.toolbarHeight - config.homeProperties.footerHeight);
	cnc.width = (windowWidth - config.homeProperties.editorWidth);
	var simulator = document.getElementById('simulator');
	simulator.appendChild(cnc);

}
