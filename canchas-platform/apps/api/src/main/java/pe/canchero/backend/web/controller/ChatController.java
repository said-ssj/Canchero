package pe.canchero.backend.web.controller;

import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.ChatService;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.util.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final ChatService service;
    public ChatController(ChatService service) { this.service=service; }
    @ModelAttribute public void privateResponses(jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control","no-store");
        response.setHeader("Pragma","no-cache");
    }
    public record OpenRequest(UUID peerId) {}
    public record SendRequest(String text,UUID requestId) {}
    public record ReadRequest(long through) {}
    public record ReportRequest(String reason,String category,boolean block) {}
    @GetMapping("/contacts") public List<ChatService.Contact> contacts(@RequestAttribute("auth.user") AuthUserDto user,@RequestParam(defaultValue="") String q){return service.contacts(user,q);}
    @PostMapping("/conversations/{id}/accept") public ChatService.Conversation accept(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){return service.accept(user,id);}
    @GetMapping("/conversations") public List<ChatService.Conversation> list(@RequestAttribute("auth.user") AuthUserDto user) {return service.list(user);}
    @PostMapping("/conversations") public ChatService.Conversation open(@RequestAttribute("auth.user") AuthUserDto user,@RequestBody OpenRequest request) {
        if(request.peerId()==null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"Elige a otra persona");
        return service.open(user,request.peerId());
    }
    @GetMapping("/conversations/{id}/messages") public ChatService.MessagePage messages(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id,@RequestParam(required=false) Long before,@RequestParam(required=false) Long after) {return service.messages(user,id,before,after);}
    @PostMapping("/conversations/{id}/messages") public ChatService.Message send(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id,@RequestBody SendRequest request) {return service.send(user,id,request.text(),request.requestId());}
    @PutMapping("/conversations/{id}/read") public void read(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id,@RequestBody ReadRequest request) {service.read(user,id,request.through());}
    @PostMapping("/conversations/{id}/reports") public void report(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id,@RequestBody ReportRequest request) {service.report(user,id,request.category()==null?"otros":request.category(),request.reason(),request.block());}
    @GetMapping("/users/{id}/relationship") public Map<String,Boolean> relationship(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id) {return service.relationship(user,id);}
    @PutMapping("/users/{id}/block") public void block(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id) {service.block(user,id,true);}
    @DeleteMapping("/users/{id}/block") public void unblock(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id) {service.block(user,id,false);}
}
