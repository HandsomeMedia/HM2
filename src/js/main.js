(function(){
    'use strict';
    
    var bg = document.getElementById('bg'), logo = document.getElementById('logo'), nav = document.getElementsByTagName('nav')[0], navBtns = [logo].concat(Array.from(nav.getElementsByTagName('button'))), tagline = document.getElementById('tagline'), mainHeader = document.getElementById('mainHeader'), glass, loading = document.getElementById('loading'), sections = ['home'].concat(Array.from(document.getElementsByTagName('section'))), sectionNum = 0, motionData = {}, motionRaf, pointerEvt;
    
    var supportsPassive = false;
    try{
        var opts = Object.defineProperty({}, 'passive', {
            get:function(){
                supportsPassive = {passive:true};
            }
        });
        window.addEventListener("test", null, opts);
    }catch(e){
        console.log('passive event listeners not supported.');
    }
    
    window.addEventListener('popstate', handlePopstate);
    function handlePopstate(e){
        if(!e.state){
            if(sectionNum !== 0 ){
                killSection();
            }
        }else if(pointerEvt){
            switch(e.state.sectionNum){
                case sectionNum: //history repeating!  Kill it.
                    history.replaceState(null, "Home");
                    killSection();
                    break;
                case 4:
                    history.replaceState({sectionNum: 1}, "Section 1");
                    break;
                default:
                    navBtns[e.state.sectionNum].dispatchEvent(pointerEvt);
            }
        }
    }

    Promise.all([loadImg('img/logo.svg'), loadImg('img/logo_extra.svg')]).then(function(imgArr){
        logo.main = imgArr[0];
        logo.main.className = 'logoMain';
        logo.i = 0; //logo is initial nav button
        logo.appendChild(logo.main);
        
        loadImg('img/logo_media.svg').then(function(img){
            img.className = 'logoMedia';
            mainHeader.insertAdjacentElement('afterbegin', img);
            mainHeader.insertAdjacentElement('afterbegin', logo.main.cloneNode());
            mainHeader.closeBtn = mainHeader.getElementsByClassName('closeBtn')[0];
            mainHeader.sectionName = mainHeader.getElementsByClassName('sectionName')[0];
        });

        logo.extra = imgArr[1];
        logo.extra.className = 'logoExtra';
        logo.appendChild(logo.extra);
        
        init();
    });
    
    function init(){
        loadImg('img/glass.jpg').then(function(img){
            glass = img;
            glass.id = 'glass';
            glass.className = 'hidden';
            logo.insertAdjacentElement('afterend', glass);
            initMotionData();
            initBg('model0');
            if(tagline.offsetParent){ //http://stackoverflow.com/a/21696585
                initTagline(); //init tagline if it's visible (it's hidden on small viewports)
            }else{
                tagline.toggle = function(){
                    return null;
                };
            }
        });
    }    
    
    function initBg(vidName){
        var vid = document.createElement('video'), fArr = [], fTotal = 0, f0;
        var rad = Math.PI / 180, deg = 180 / Math.PI, freq = 0.75, phase = 0, scale = 1, offset = 0; //gyro constants
        bg.className = nav.className = 'hidden';
        if(sectionNum !== 0){
            killSection();
            history.replaceState(null, "Home");
        }
        
        vid.hidden = true;
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.addEventListener('loadedmetadata', initCanvas);
        vid.addEventListener('canplaythrough', play);
        if(window.matchMedia('(max-height: 960px)').matches){
            vid.src = 'vid/' + vidName + '_lo.mp4'; //960 x 720, 30fps, High 4.1, 2/2.2Mbps 
        }else{
            vid.src = 'vid/' + vidName + '.mp4'; //1440 x 1080, 60fps, High 4.2, 4.5/5Mbps 
        }
        document.body.appendChild(vid);
        
        vid.load();
        
        function initCanvas(){
            vid.removeEventListener('loadedmetadata', initCanvas);

            var ratio = Math.min(1, Math.min(vid.videoWidth / document.body.clientWidth, vid.videoHeight / document.body.clientHeight)); //only draw what is visible in viewport, with max of actual video dimensions
            bg.width = document.body.clientWidth * ratio;
            bg.height = document.body.clientHeight * ratio;
            ratio = Math.max(bg.width / vid.videoWidth, bg.height / vid.videoHeight); //2nd ratio is for scaling and positioning drawn video
            bg.sx = Math.round((vid.videoWidth - bg.width / ratio) / 2);
            bg.sy = Math.round((vid.videoHeight - bg.height / ratio) / 2);
            bg.sw = vid.videoWidth - 2 * bg.sx;
            bg.sh = vid.videoHeight - 2 * bg.sy;
            bg.ctx = bg.getContext('2d');
        }

        function play(){
            vid.removeEventListener('canplaythrough', play);
            vid.addEventListener('playing', initExtraction);
            vid.play();
            setTimeout(function(){
                nav.removeAttribute('class'); //show nav - it may not be enabled yet (see motionData)
            }, 1000);
        }

        function initExtraction(){
            vid.removeEventListener('playing', initExtraction);

            var img, storeImgData, cTemp = document.createElement('canvas'); //cTemp was added in case user clicks nav button before extraction is complete
            cTemp.width = bg.width;
            cTemp.height = bg.height;
            cTemp.ctx = cTemp.getContext('2d');
            bg.className = 'extracting';

            if(typeof createImageBitmap === 'function'){
                //extraction via Bitmap 
                storeImgData = function(){
                    createImageBitmap(cTemp).then(function(bitmap){ //Chrome and Firefox
                        fArr[fTotal++] = bitmap;
                    });
                };
            }else{
                //extraction via Blob
                if(!HTMLCanvasElement.prototype.toBlob){ //old Chrome and Firefox
                    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
                        value:function(callback, type, quality){
                            var binStr = atob(this.toDataURL(type, quality).split(',')[1]),
                                    len = binStr.length,
                                    arr = new Uint8Array(len);

                            for(var i = 0; i < len; i++){
                                arr[i] = binStr.charCodeAt(i);
                            }
                            callback(new Blob([arr], {type:type || 'image/png'}));
                        }
                    });
                }
                
                storeImgData = function(){
                    cTemp.toBlob(function(blob){ //Safari and Edge
                        img = document.createElement('img');
                        img.url = URL.createObjectURL(blob);
                        img.addEventListener('load', revoke);
                        img.src = img.url;
                        fArr[fTotal++] = img;

                        function revoke(e){
                            e.target.removeEventListener('load', revoke);
                            URL.revokeObjectURL(e.target.url);
                            delete e.target.url;
                        }
                    }, 'image/jpeg', 0.7);
                };
            }
            requestAnimationFrame(extract);
            
            function extract(){
                cTemp.ctx.drawImage(vid, bg.sx, bg.sy, bg.sw, bg.sh, 0, 0, bg.width, bg.height);
                storeImgData();
                if(glass.className === 'hidden'){
                    bg.ctx.drawImage(cTemp, 0, 0);
                }
                if(vid.ended){
                    extractComplete();
                }else{
                    requestAnimationFrame(extract);
                }
            }

            function extractComplete(){
                console.log('extracted ' + fTotal + ' frames');
                document.body.removeChild(vid);
                vid = null;
                cTemp = null;
                tagline.toggle();
                if(bg.className === 'extracting'){
                    bg.removeAttribute('class');
                }
                if(glass.className === 'hidden'){
                    bg.initMotion(true);
                }
            }
        }
        
        bg.toggleFreeze = function(freeze){
            if(freeze && glass.className === 'hidden'){
                cancelAnimationFrame(motionRaf);
                bg.initMotion();
                bg.className = nav.className = logo.className = 'disabled';
                glass.removeAttribute('class');
                tagline.toggle();
            }else if(glass.className !== 'hidden'){
                logo.removeAttribute('class');
                glass.className = 'hidden';
                if(bg.className === 'disabled'){ //bg is frozen/blurred; model is NOT loading
                    bg.removeAttribute('class');
                    bg.initMotion();
                    nav.removeAttribute('class');
                    tagline.toggle();
                }
            }
            
        };
        
        bg.initMotion = function(firstrun){
            var m, m1, z, x, y, s = firstrun ? 15 : 5, f1;
            if(f0 === undefined){
                f0 = fTotal - 1;
            }
            motionRaf = requestAnimationFrame(update);
            
            function update(){
                if(glass.className !== 'hidden'){ //glass and section visible, freeze bg
                    f1 = 0;
                }else{
                    switch(motionData.type){
                        case 'touch':
                        case 'mouse':
                            f1 = motionData.x / document.body.clientWidth * fTotal;
                            break;
                        case 'gyro':
                            z = motionData.alpha * rad;
                            x = motionData.beta * rad;
                            y = motionData.gamma * rad;
                            m = Math.cos(y) * Math.sin(z) * Math.sin(x) + Math.cos(z) * Math.sin(y); //specific value pulled from rotation matrix formula (m13)
                            m1 = Math.asin(m)*deg/90; //convert to angle from -90 to 90, then divide by 90 to get balanced multiplier from -1 to 1 (original m is rad-based and not balanced)
                            f1 = (Math.abs((2 * freq * (m1 + 1) + phase) % 2 - 1) * scale - offset) * fTotal; //see triangle wave formula: stackoverflow.com/a/41730288/
                            break;
                        default: //unknown motion or user hasn't moved device - set target frame middle
                            f1 = Math.round(fTotal / 2);
                    }
                }

                if(Math.abs(f1 - f0) > 1){
                    f0 = (f0*s + f1) / (s+1);
                    motionRaf = requestAnimationFrame(update);
                }else{
                    f0 = f1;
                    motionRaf = null;
                }
                bg.ctx.drawImage(fArr[Math.floor(f0)], 0, 0);
                
            }
            
            /*
            function getRotationMatrix(){
                var z = motionData.alpha * rad;
                var x = motionData.beta * rad;
                var y = motionData.gamma * rad;
                
                var cX = Math.cos(x);
                var cY = Math.cos(y);
                var cZ = Math.cos(z);
                var sX = Math.sin(x);
                var sY = Math.sin(y);
                var sZ = Math.sin(z);

                //ZXY-ordered rotation matrix construction.  This is the convention (Tait-Bryan) used on Android (not tested yet on others)

                var m11 = cZ * cY - sZ * sX * sY;
                var m12 = -cX * sZ;
                var m13 = cY * sZ * sX + cZ * sY;
                

                var m21 = cY * sZ + cZ * sX * sY;
                var m22 = cZ * cX;
                var m23 = sZ * sY - cZ * cY * sX;

                var m31 = -cX * sY;
                var m32 = sX;
                var m33 = cX * cY;

                return [
                    m11, m12, m13,
                    m21, m22, m23,
                    m31, m32, m33
                ];
            }
            */
        };
    }
    
    function initMotionData(){
        addEventListener('deviceorientation', motionTrigger);
        addEventListener('mousemove', motionTrigger);
        addEventListener('touchstart', motionTrigger);

        function motionTrigger(e){
            if(e.clientX){
                motionData.type = 'mouse';
                addEventListener('mousemove', updateMotionData);
            }else if(e.alpha){
                motionData.type = 'gyro';
                motionData.alpha0 = 360 - e.alpha; //android and iOS use arbitrary alpha, so normalize to 0 by recording intial value (adjusted for modulus) and use change in alpha
                addEventListener('deviceorientation', updateMotionData);
            }else if(e.targetTouches){
                motionData.type = 'touch'; //in case user is on touch device without gyroscope
                addEventListener('touchstart', updateMotionData);
            }else{
                return; //in case null or 0 or undefined initially reported
            }

            removeEventListener('deviceorientation', motionTrigger);
            removeEventListener('mousemove', motionTrigger);
            removeEventListener('touchstart', motionTrigger);
            
            initNav(); //init nav using motionData.type to specify mouse or touch
            updateMotionData(e);
        }

        function updateMotionData(e){
            switch(motionData.type){
                case 'mouse':
                    motionData.x = e.clientX;
                    break;
                case 'gyro':
                    if(Math.abs(motionData.gamma - e.gamma) < 0.1){
                        return;
                    }
                    motionData.alpha = (e.alpha + motionData.alpha0) % 360;
                    motionData.beta = e.beta;
                    motionData.gamma = e.gamma;
                    break;
                case 'touch':
                    motionData.x = e.targetTouches[0].clientX;
                    break;
            }

            if(glass.className === 'hidden' && !motionRaf && bg.className !== 'extracting' && bg.className !== 'hidden'){
                bg.initMotion();
            }
        }
    }
    
    function initNav(){
        switch(motionData.type){
            case 'mouse':
                pointerEvt = new MouseEvent('mousedown', {'view':window, 'bubbles':true, 'cancelable':true});
                break;
            case 'gyro':
            case 'touch':
                pointerEvt = new TouchEvent('touchstart', {'view':window, 'bubbles':true, 'cancelable':true});
                break;
        }
        
        navBtns.forEach(function(btn, i){
            btn.i = i;
            btn.addEventListener(pointerEvt.type, navEvt, supportsPassive); //add listeners based on pointerEvt gathered from motion data
        });
        
        mainHeader.closeBtn.addEventListener(pointerEvt.type, closeEvt, supportsPassive);
        
        function closeEvt(e){
            if(sectionNum === 4){
                killProjDetail();
            }else{
                killSection();
                history.replaceState(null, "Home");
            }
        }
        
        function navEvt(e){
            if(e.target.i === 0){
                window.location.reload(true);
                return;
            }else if(sectionNum === 4){
                killProjDetail();
                return;
            }
            bg.toggleFreeze(true);
            sectionNum = e.target.i;
            setTimeout(initSection, 400); //at the time of this build toggleFreeze is very cpu intesive. This is why we do all section actions after the 'freeze' animation is complete
            if(e.isTrusted){
                history.pushState({sectionNum:sectionNum}, "Section " + sectionNum); //navigation occured via site, not forward button (don't create a new history state for forward button press)
            }

        }           
    }
    
    function initSection(){
        var section = sections[sectionNum];
        
        if(mainHeader.tagFilterBtn){
            mainHeader.tagFilterBtn.remove(); //reset header while it's hidden
            delete mainHeader.tagFilterBtn;
        }
        
        mainHeader.removeAttribute('class');

        switch(sectionNum){
            case 1:
                initProjects();
                break;
            case 2:
                initModels();
                break;
            case 3:
                mainHeader.sectionName.textContent = 'CONTACT';
                break;
        }
        
        section.removeAttribute('class');
        
        function initModels(){
            var item, div, img;
            loading.removeAttribute('class');
            mainHeader.sectionName.textContent = 'MENAGERIE';

            loadXHR('http://handsomemedia.com/drupal/modellist').then(function(response){
                loading.className = 'hidden';
                response.forEach(function(obj){
                    item = document.createElement('div');
                    item.className = 'item';
                    item.filename = obj.filename;
                    item.addEventListener('click', showModel);

                    img = document.createElement('img');
                    img.alt = obj.modelname;
                    item.appendChild(img);
                    loadImg(obj.thumb, img).then(function(img){
                        img.parentNode.className = 'item visible';
                    });

                    div = document.createElement('div');
                    div.innerHTML = '<h2>' + obj.modelname + '</h2>' + '<h3 class="italic">' + obj.desc + '</h3>';
                    item.appendChild(div);
                    section.appendChild(item);
                });
            });
            
            function showModel(e){
                initBg(e.currentTarget.filename);
            }
        }
        
        function initProjects(){
            var projListUrl = 'http://handsomemedia.com/drupal/projectlist', tagListUrl = 'http://handsomemedia.com/drupal/taglist', tagDiv = document.createElement('div'), item, div, img, btn;
            
            mainHeader.sectionName.textContent = 'PROJECTS';    
            mainHeader.tagFilterBtn = document.createElement('button');
            mainHeader.tagFilterBtn.id = 'tagFilterBtn'; //create tag filter button in the header
            mainHeader.tagFilterBtn.textContent = 'All';
            mainHeader.tagFilterBtn.addEventListener(pointerEvt.type, toggleTagDiv, supportsPassive);
            mainHeader.insertBefore(mainHeader.tagFilterBtn, mainHeader.sectionName);
            
            btn = document.createElement('button'); //create initial 'all' tag
            btn.textContent = mainHeader.tagFilterBtn.textContent;
            btn.className = 'blue';
            btn.hidden = 'true';
            btn.url = projListUrl;
            btn.addEventListener(pointerEvt.type, showProjects, supportsPassive);
            tagDiv.appendChild(btn);
            
            loadXHR(tagListUrl).then(function(response){
                response.forEach(function(obj){ //create remaining tags
                    btn = document.createElement('button');
                    if(obj.name[0] === obj.name[0].toUpperCase()){
                        btn.className = 'peach'; //change color for titles-case tags, i.e. businesses/studios
                    }
                    btn.textContent = obj.name;
                    btn.url = 'http://handsomemedia.com/drupal/tid/' + obj.tid;
                    btn.addEventListener(pointerEvt.type, showProjects, supportsPassive);
                    tagDiv.appendChild(btn);
                });
            });
            
            tagDiv.id = 'tagDiv';
            tagDiv.className = 'hidden';
            mainHeader.insertAdjacentElement('beforebegin', tagDiv);
            
            section.itemDiv = document.createElement('div');
            section.itemDiv.className = 'itemDiv';
            section.appendChild(section.itemDiv);
            showProjects();
                        
            function toggleTagDiv(){
                if(tagDiv.className === 'hidden'){
                    tagDiv.removeAttribute('class');
                }else{
                    tagDiv.className = 'hidden';
                }
            }
            
            function showProjects(e){
                if(e){ //user clicked a tag button
                    projListUrl = e.target.url;
                    clearChildren(section.itemDiv); //clear prev children while section is hidden
                    mainHeader.tagFilterBtn.textContent = e.target.textContent;
                    if(e.target.parentNode === tagDiv){
                        toggleTagDiv();
                        setTimeout(function(){ //hide current tag and show previously hidden tag after animation
                            tagDiv.querySelector('button[hidden]').removeAttribute('hidden');
                            e.target.hidden = 'true';
                        }, 300);
                    }
                }
                
                if(mainHeader.tagFilterBtn.className === 'hidden'){
                    killProjDetail(); //tag button was pushed from Project Detail page
                }

                loading.removeAttribute('class');
                loadXHR(projListUrl).then(function(response){
                    loading.className = 'hidden';
                    response.forEach(function(obj){
                        item = document.createElement('div');
                        item.className = 'item';
                        
                        img = document.createElement('img');
                        img.alt = obj.title;
                        item.appendChild(img);                        
                        loadImg(obj.field_main_image, img).then(function(img){
                            img.parentNode.className = 'item visible';
                        });

                        div = document.createElement('div');
                        div.className = 'title';
                        div.innerHTML = '<h2>'+obj.title+'</h2>' + '<h3 class="italic">'+obj.field_subtitle+'</h3>';
                        item.appendChild(div);
                        
                        btn = document.createElement('button');
                        btn.id = obj.nid;
                        btn.className = 'detailBtn';
                        btn.textContent = 'More Details';
                        btn.addEventListener('click', initProjDetail);
                        item.appendChild(btn);
                        
                        item.insertAdjacentHTML('beforeend', obj.field_link);
                        section.itemDiv.appendChild(item);
                    });
                });
            }
            
            function initProjDetail(e){
                var item = e.target.parentNode, div, btn, dtl = document.getElementsByClassName('detail')[0], dtlHeader = document.getElementById('dtlHeader'), dtlContent = dtl.getElementsByClassName('content')[0];
                mainHeader.sectionName.textContent = 'PROJECT DETAIL';
                
                dtl.parentNode.scrollTop = 0;
                clearChildren(dtlHeader); //clear prev children while detail is hidden
                clearChildren(dtlContent);
                mainHeader.tagFilterBtn.className = 'hidden';
                if(tagDiv.className !== 'hidden'){
                    toggleTagDiv();
                }
                
                dtlHeader.bg = document.createElement('div');
                dtlHeader.bg.style.backgroundImage = 'linear-gradient(to right, #111111, transparent, transparent, #111111), url('+item.firstChild.src+')';
                dtlHeader.bg.appendChild(item.getElementsByClassName('title')[0].cloneNode(true));
                dtlHeader.appendChild(dtlHeader.bg);
                void dtl.offsetWidth;
                dtl.parentNode.removeAttribute('class');
                section.itemDiv.className = 'itemDiv disabled';
                
                sectionNum = 4;
                if(e.isTrusted){
                    history.pushState({sectionNum: sectionNum}, "Project Detail");
                }
                delay(500).then(function(){
                    loading.removeAttribute('class');
                });
                
                Promise.all([loadXHR('http://handsomemedia.com/drupal/project/' + e.target.id), delay(501)]).then(function(arr){
                    var obj = arr[0][0], tagArr = obj.tags.split(','), parser = new DOMParser(), imgArr;
                    loading.className = 'hidden';
                    div = document.createElement('div');
                    div.innerHTML = '<h4 class="hilite">'+obj.field_summary+'</h4><hr>';
                    div.insertAdjacentHTML('beforeend', '<h3 class="hilite block white"><img src="img/linkIco.svg"><span>'+obj.field_link+'</span></h3>');
                    div.insertAdjacentHTML('beforeend', '<h3 class="hilite block white"><img src="img/clientIco.svg"><span>'+obj.client+' <span class="gray spacing0">'+obj.client_note+'</span></span></h3>');
                    div.insertAdjacentHTML('beforeend', '<h3 class="hilite block white"><img src="img/techIco.svg"><span>'+obj.tech+'</span></h3>');
                    div.insertAdjacentHTML('beforeend', '<h3 class="hilite block white"><img src="img/tagIco.svg"></h3>');
                    tagArr.forEach(function(name){
                        btn = document.createElement('button');
                        btn.textContent = name;
                        btn.url = encodeURI('http://handsomemedia.com/drupal/tag/' + name);
                        btn.addEventListener('click', showProjects);
                        div.lastChild.appendChild(btn);
                    });
                    dtlContent.appendChild(div);
                    
                    dtlContent.screenshots = document.createElement('div');
                    dtlContent.screenshots.className = 'screenshots';
                    dtlContent.appendChild(dtlContent.screenshots);
                    
                    imgArr = Array.from(parser.parseFromString(obj.field_images, "text/html").getElementsByTagName('img'));
                    imgArr.forEach(function(img){
                        div = document.createElement('div');
                        div.className = 'hidden';
                        div.appendChild(img);
                        img.addEventListener('load', loaded);
                        img.src = 'http://handsomemedia.com'+img.getAttribute('src'); //must use 'getAttribute' instead of direct javascript property (tested Chrome).  Also, this 'src' rewrite is only needed for localhost testing...
                        div.insertAdjacentHTML('beforeend', '<h3 class="italic">'+img.getAttribute('alt')+'</h3>');
                        dtlContent.screenshots.appendChild(div);
                        function loaded(e){
                            e.target.removeEventListener('load', loaded);
                            e.target.parentNode.removeAttribute('class');
                        }
                    });
                });
            }
        }
    }
    
    function killProjDetail(){
        mainHeader.sectionName.textContent = 'PROJECTS';
        document.getElementById('detail3d').className = 'hidden';
        mainHeader.tagFilterBtn.removeAttribute('class');
        sectionNum = 1;
        sections[sectionNum].itemDiv.className = 'itemDiv';
    } 

    function killSection(){
        mainHeader.className = 'disabled';
        bg.toggleFreeze(false);
        sections[sectionNum].className = 'hidden';
        switch(sectionNum){
            case 1:
                document.getElementById('tagDiv').remove();
            case 2:
                clearChildren(sections[sectionNum]);
                break;
        }
        sectionNum = 0;
    }
    
    function clearChildren(parent){
        while(parent.lastChild){
            parent.lastChild.remove();
        }
    }

    function initTagline(){
        var left = tagline.getElementsByTagName('ul')[0], right = tagline.getElementsByTagName('ul')[1], raf, d = 750, magnitude = 1.70158;
        left.total = left.children.length*50;
        left.appendChild(left.firstChild.cloneNode(true));
        left.y = 0;
        
        right.total = right.children.length*50;
        right.appendChild(right.firstChild.cloneNode(true));
        right.y = 0;
        
        tagline.toggle = function(){
            if(glass.className === 'hidden' && nav.className !== 'hidden' && nav.className !== 'disabled'){
                tagline.removeAttribute('class');
                tagline.addEventListener('mousedown',spin);
                spin();
            }else{
                tagline.className = 'hidden';
                clearInterval(tagline.interval);
                tagline.removeEventListener('mousedown',spin);
            }
        };
        
        function spin(){
            if(raf){
                return;
            }
            
            var t0 = performance.now(), tDelta;
            left.rand = Math.random();
            left.y0 = left.y;
            left.y1 = 50*Math.round(left.rand*(left.children.length/2)) + 50;
            right.rand = Math.random();
            right.y0 = right.y;
            right.y1 = 50*Math.round(right.rand*(right.children.length/2)) + 50;
            
            clearInterval(tagline.interval);
            raf = requestAnimationFrame(update);
            
            function update(t1){
                tDelta = tagline.className === 'hidden' ? 1 : Math.min(1, (t1 - t0) / d);
                left.y = (left.y0 + left.y1 * easeOutBack(tDelta, left.rand * 2.5) - left.total) % left.total;
                right.y = (right.y0 - right.y1 * easeOutBack(tDelta, right.rand * 2.5)) % right.total;
                left.style.transform = 'translateY(' + left.y + 'px)';
                right.style.transform = 'translateY(' + right.y + 'px)';

                if(tDelta < 1){
                    raf = requestAnimationFrame(update);
                }else{
                    raf = null;
                    if(tagline.className !== 'hidden'){
                        tagline.interval = setInterval(function(){
                            if(!motionRaf){
                                spin();
                            }
                        },4000);
                    }
                }

            }

        }
        
        function easeOutBack(t){
            var scaledTime = (t / 1) - 1;
            return (scaledTime * scaledTime * ((magnitude + 1) * scaledTime + magnitude)) + 1;

        }        
    }
    
    function loadXHR(url){
        return new Promise(function(resolve, reject){
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.responseType = "json";
            xhr.onload = function(){
                if(xhr.status === 200){
                    resolve(xhr.response);
                }else{
                    reject(console.log('XHR request failed:', xhr.statusText));
                }
            };
            xhr.onerror = function(){
                reject(console.log('There was a network error.'));
            };
            xhr.send();
        });
    }

    function loadImg(url, imgEl){
        return new Promise(function(resolve, reject){
            var img = imgEl || document.createElement('img'); //use exisiting image element if provided, or create a new one
            img.addEventListener('load', complete);
            img.addEventListener('error', error);
            img.src = url;
            function complete(){
                img.removeEventListener('load', complete);
                img.removeEventListener('error', error);
                resolve(img);
            }
            function error(){
                img.removeEventListener('load', complete);
                img.removeEventListener('error', error);
                reject(console.log('There was a network error.'));
            }
        });
    }
    
    function delay(ms){
        return new Promise(function (resolve, reject) {
            setTimeout(resolve, ms);
        });
    }

})();