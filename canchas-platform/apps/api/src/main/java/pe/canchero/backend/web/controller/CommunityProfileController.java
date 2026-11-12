package pe.canchero.backend.web.controller;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import pe.canchero.backend.service.CommunityProfileService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/community")
public class CommunityProfileController {
  @ModelAttribute public void privateResponses(jakarta.servlet.http.HttpServletResponse response){response.setHeader("Cache-Control","private, no-store");}
  private final CommunityProfileService service;
  public CommunityProfileController(CommunityProfileService service){this.service=service;}
  @GetMapping("/venues/{id}/owner") public CommunityProfileService.Owner owner(@PathVariable int id,@RequestAttribute(value="auth.user",required=false) AuthUserDto viewer){return viewer==null?service.venueOwner(id):service.venueOwner(id,viewer);}
  @GetMapping("/profiles/{id}") public CommunityProfileService.Profile profile(@PathVariable UUID id,@RequestAttribute(value="auth.user",required=false) AuthUserDto viewer){return viewer==null?service.profile(id):service.profile(id,viewer);}
  @GetMapping("/profiles/{id}/posts") public CommunityProfileService.PostPage posts(@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestAttribute(value="auth.user",required=false) AuthUserDto viewer){return viewer==null?service.posts(id,page):service.posts(id,page,viewer);}
  public record PostRequest(String text,List<String> photos){}
  @PostMapping("/posts") @ResponseStatus(HttpStatus.CREATED) public CommunityProfileService.Post publish(@RequestAttribute("auth.user") AuthUserDto user,@RequestBody PostRequest request){return service.publish(user,request.text(),request.photos());}
  @DeleteMapping("/posts/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){service.deletePost(user,id);}
  @PutMapping("/me/settings") public CommunityProfileService.Settings settings(@RequestAttribute("auth.user") AuthUserDto user,@RequestBody CommunityProfileService.Settings settings){return service.saveSettings(user,settings);}
  @GetMapping("/profiles/search") public List<CommunityProfileService.ProfileSearchResult> searchProfiles(@RequestParam(name="q", defaultValue="") String q,@RequestAttribute(value="auth.user",required=false) AuthUserDto viewer){return service.searchProfiles(q,viewer);}
  @GetMapping("/profiles/{id}/relationship") public Map<String,Object> relationship(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){return Map.of("following",service.following(user,id),"mutualFollowers",service.mutualFollowers(user,id));}
  @PutMapping("/profiles/{id}/follow") public void follow(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){service.follow(user,id,true);}
  @DeleteMapping("/profiles/{id}/follow") public void unfollow(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){service.follow(user,id,false);}
}
