const certificate = document.getElementById('certificate')
const dropdown = document.getElementById('dropdown')
const capsule = document.getElementById('capsule')
const cap_dropdown = document.getElementById('cap-dropdown')
let hoverTimeout;


const menu = document.getElementById('hamburger')
      const menu_bar = document.getElementById('menu-bar')
      menu.addEventListener('click', function(){
        menu_bar.classList.toggle("hidden")
      })


 certificate.addEventListener('mouseover', function()
  {     clearTimeout(hoverTimeout); 
    dropdown.classList.remove("hidden")
  });
   


    document.addEventListener("mouseover", function(event) {
        if (!certificate.contains(event.target) && !dropdown.contains(event.target)) {
            hoverTimeout = setTimeout(() => {
                dropdown.classList.add("hidden");
            }, 500);
          
        }
      })

      capsule.addEventListener('mouseover', function()
      {     clearTimeout(hoverTimeout); 
        cap_dropdown.classList.remove("hidden")
      });

      document.addEventListener("mouseover", function(event) {
        if (!capsule.contains(event.target) && !cap_dropdown.contains(event.target)) {
            hoverTimeout = setTimeout(() => {
                cap_dropdown.classList.add("hidden");
            }, 500);
          
        }
      })
      
      gsap.to("#header", {
        scrollTrigger: {
          trigger: "#header", // Trigger when the header is in view
          start: "top top", // Start animation when the top of the header hits the top of the viewport
          endTrigger: "body", // End animation when the body ends
          end: "bottom top", // End animation when the bottom of the header hits the top of the viewport
          pin: true, // Pin the header
          pinSpacing: false // Disable pin spacing
        }
      });